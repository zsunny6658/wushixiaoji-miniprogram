Component({
  data: {
    active: 0,
    centerVisible: true,
    voiceRecording: false
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
        2: '/pages/quadrant/quadrant',
        3: '/pages/me/me'
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

    startRecording: function () {
      var that = this;
      var recorder = wx.getRecorderManager();

      recorder.onStop(function (res) {
        that.setData({ voiceRecording: false });
        if (!res.tempFilePath) return;
        var fs = wx.getFileSystemManager();
        var b64;
        try {
          b64 = fs.readFileSync(res.tempFilePath, 'base64');
        } catch (e) {
          wx.showToast({ title: '录音读取失败', icon: 'none' });
          return;
        }
        wx.showLoading({ title: '转写中...' });
        var api = require('../utils/api');
        api.parseAudio('data:audio/mpeg;base64,' + b64, function (data) {
          wx.hideLoading();
          var transcript = data.transcript || '';
          if (!transcript) {
            wx.showToast({ title: '未识别到语音内容', icon: 'none' });
            return;
          }
          if (data.records && data.records.length > 1) {
            api.addPackages(data.records, function () {
              wx.showToast({ title: '已导入 ' + data.records.length + ' 条', icon: 'success' });
            });
            return;
          }
          if (data.records && data.records.length === 1) {
            getApp().globalData._pendingAddData = data.records[0];
            wx.navigateTo({ url: '/pages/add/add' });
            return;
          }
          getApp().globalData._pendingSmartText = transcript;
          wx.navigateTo({ url: '/pages/add/add' });
        }, function () {
          wx.hideLoading();
          wx.showToast({ title: '语音识别失败', icon: 'none' });
        });
      });

      recorder.onError(function (err) {
        that.setData({ voiceRecording: false });
        wx.showToast({ title: '录音失败', icon: 'none' });
      });

      that.setData({ voiceRecording: true });

      recorder.start({
        duration: 60000,
        sampleRate: 16000,
        numberOfChannels: 1,
        encodeBitRate: 96000,
        format: 'mp3'
      });

      // 长按持续录音，超时自动停止
      setTimeout(function () {
        if (that.data.voiceRecording) {
          that.stopRecording();
        }
      }, 60000);
    },

    stopRecording: function () {
      if (!this.data.voiceRecording) return;
      try {
        wx.getRecorderManager().stop();
      } catch (e) {}
    }
  }
});
