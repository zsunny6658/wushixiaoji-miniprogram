Component({
  data: {
    active: 0,
    centerVisible: true,
    voiceRecording: false,
    transcribing: false,
    recSeconds: 0,
    transcriptPreview: '',
    showPreview: false
  },

  lifecycle: {
    detached: function () {
      if (this.data.voiceRecording) this.stopRecording();
    }
  },

  methods: {
    switchTab: function (e) {
      var idx = parseInt(e.currentTarget.dataset.index, 10);
      var urls = {
        0: '/pages/overview/overview',
        1: '/pages/list/list',
        2: '/pages/me/me'
      };
      var url = urls[idx];
      if (url) wx.switchTab({ url: url });
    },

    openAdd: function () {
      wx.navigateTo({ url: '/pages/add/add' });
    },

    onVoiceTap: function () {
      this.startRecording();
    },

    onVoiceEnd: function () {
      this.stopRecording();
    },

    noop: function () {},

    startRecording: function () {
      var that = this;
      var recorder = wx.getRecorderManager();
      var startTime = 0;
      var timer = null;

      recorder.onStop(function (res) {
        that.setData({ voiceRecording: false });
        if (timer) { clearInterval(timer); timer = null; }
        if (!res.tempFilePath) return;
        var fs = wx.getFileSystemManager();
        var b64;
        try {
          b64 = fs.readFileSync(res.tempFilePath, 'base64');
        } catch (e) {
          wx.showToast({ title: '录音读取失败', icon: 'none' });
          return;
        }
        // 从文件路径检测实际音频格式（iOS 默认 m4a，Android 默认 mp3/amr）
        var ext = res.tempFilePath.split('.').pop().toLowerCase();
        var audioFormat = ext === 'mp3' || ext === 'm4a' || ext === 'aac' || ext === 'amr' || ext === 'wav' ? ext : 'mp3';
        that.setData({ transcribing: true, recSeconds: 0 });
        var api = require('../utils/api');
        api.voiceTranscribe(b64, audioFormat, function (data) {
          that.setData({ transcribing: false });
          if (data.error === 'quota_exhausted') {
            wx.showToast({ title: '语音额度已用尽，请下次再试', icon: 'none' });
            return;
          }
          if (!data.ok) {
            wx.showToast({ title: (data.error || '语音识别失败'), icon: 'none' });
            return;
          }
          var transcript = data.text || '';
          if (!transcript) {
            wx.showToast({ title: '未识别到语音内容', icon: 'none' });
            return;
          }
          that.setData({ transcriptPreview: transcript, showPreview: true });
        }, function () {
          that.setData({ transcribing: false });
          wx.showToast({ title: '语音识别失败', icon: 'none' });
        });
      });

      recorder.onError(function (err) {
        that.setData({ voiceRecording: false });
        if (timer) { clearInterval(timer); timer = null; }
        wx.showToast({ title: '录音失败', icon: 'none' });
      });

      that.setData({ voiceRecording: true, recSeconds: 0 });
      startTime = Date.now();

      timer = setInterval(function () {
        var elapsed = Math.floor((Date.now() - startTime) / 1000);
        if (elapsed >= 60) {
          if (timer) { clearInterval(timer); timer = null; }
          if (that.data.voiceRecording) that.stopRecording();
          return;
        }
        that.setData({ recSeconds: elapsed });
      }, 1000);

      recorder.start({
        duration: 60000,
        sampleRate: 16000,
        numberOfChannels: 1,
        encodeBitRate: 96000,
        format: 'mp3'
      });

      setTimeout(function () {
        if (that.data.voiceRecording) that.stopRecording();
      }, 60000);
    },

    stopRecording: function () {
      if (!this.data.voiceRecording) return;
      try {
        wx.getRecorderManager().stop();
      } catch (e) {}
    },

    onConfirmPreview: function () {
      var transcript = this.data.transcriptPreview;
      this.setData({ showPreview: false, transcriptPreview: '' });
      var api = require('../utils/api');
      api.parse(transcript, 'auto', function (parseData) {
        var records = parseData.records || [];
        if (records.length > 1) {
          api.addPackages(records, function () {
            wx.showToast({ title: '已导入 ' + records.length + ' 条', icon: 'success' });
          });
          return;
        }
        if (records.length === 1) {
          getApp().globalData._pendingAddData = records[0];
          wx.navigateTo({ url: '/pages/add/add' });
          return;
        }
        getApp().globalData._pendingSmartText = transcript;
        wx.navigateTo({ url: '/pages/add/add' });
      }, function () {
        getApp().globalData._pendingSmartText = transcript;
        wx.navigateTo({ url: '/pages/add/add' });
      });
    },

    onDismissPreview: function () {
      this.setData({ showPreview: false, transcriptPreview: '' });
    },

    onCopyTranscript: function () {
      wx.setClipboardData({
        data: this.data.transcriptPreview,
        success: function () {
          wx.showToast({ title: '已复制', icon: 'success' });
        }
      });
    }
  }
});
