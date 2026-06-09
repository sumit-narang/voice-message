const { expo } = require('./app.json')

module.exports = ({ config }) => ({
  ...expo,
  plugins: [
    ...(expo.plugins || []).filter(p => p !== '@rnmapbox/maps'),
    [
      '@rnmapbox/maps',
      { RNMapboxMapsDownloadToken: process.env.RNMAPBOX_MAPS_DOWNLOAD_TOKEN || '' },
    ],
  ],
})
