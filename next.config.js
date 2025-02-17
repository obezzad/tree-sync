const path = require('path');

module.exports = {
  images: {
    disableStaticImages: true
  },
  webpack: (config) => {
    config.snapshot.unmanagedPaths = [
      path.resolve(__dirname, 'local_modules/@powersync/common/dist'),
      path.resolve(__dirname, 'local_modules/@powersync/web/dist')
    ];

    return config;
  }
};
