package com.readest.native_tts

import androidx.core.content.FileProvider

/**
 * Serves the audiobook cover to the system player as a content:// address. It is the plugin's
 * own provider (with its own paths file), so the cover does not depend on how the app's project
 * was generated.
 */
class CoverProvider : FileProvider()
