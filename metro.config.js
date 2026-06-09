const { getDefaultConfig } = require('expo/metro-config')
const path = require('path')

const config = getDefaultConfig(__dirname)

const defaultResolver = config.resolver.resolveRequest

config.resolver.resolveRequest = (context, moduleName, platform) => {
  // ExpoModulesCoreJSLogger doesn't expose addListener in old arch bridge mode.
  // Return null so setUpJsLogger.fx.ts safely skips the event listener setup.
  if (
    moduleName === './NativeJSLogger' &&
    context.originModulePath.includes('expo-modules-core')
  ) {
    return {
      type: 'sourceFile',
      filePath: path.resolve(__dirname, 'src/stubs/NativeJSLogger.js'),
    }
  }

  return defaultResolver
    ? defaultResolver(context, moduleName, platform)
    : context.resolveRequest(context, moduleName, platform)
}

module.exports = config
