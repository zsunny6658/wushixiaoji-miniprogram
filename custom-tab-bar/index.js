Component({
  data: {
    active: 0,
    centerVisible: true
  },

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
  }
});
