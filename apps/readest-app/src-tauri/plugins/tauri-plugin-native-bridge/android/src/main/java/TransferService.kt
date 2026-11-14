package com.readest.native_bridge

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import android.os.PowerManager

/**
 * Keeps the app alive while books are being uploaded or downloaded, so a transfer carries on when
 * the screen is locked or another app is in front. Android stops background apps within minutes
 * unless they run a foreground service, which shows the notification below for as long as it runs.
 * The transfers themselves are done by the app; this only keeps the process (and the CPU) awake.
 * It is started when the first transfer begins and stopped when the queue is empty
 * (see [NativeBridgePlugin.set_transfer_service]).
 */
class TransferService : Service() {
    private var wakeLock: PowerManager.WakeLock? = null

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        val text = intent?.getStringExtra(EXTRA_TEXT)?.takeIf { it.isNotBlank() } ?: DEFAULT_TEXT
        try {
            val notification = buildNotification(text)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                startForeground(
                    NOTIFICATION_ID,
                    notification,
                    ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC,
                )
            } else {
                startForeground(NOTIFICATION_ID, notification)
            }
            holdWakeLock()
        } catch (e: Exception) {
            // Android refuses to start a foreground service from the background in some cases;
            // the transfers then just carry on as far as the system lets them.
            stopSelf()
        }
        return START_NOT_STICKY
    }

    override fun onDestroy() {
        wakeLock?.let { if (it.isHeld) it.release() }
        wakeLock = null
        super.onDestroy()
    }

    private fun holdWakeLock() {
        if (wakeLock?.isHeld == true) return
        val power = getSystemService(Context.POWER_SERVICE) as PowerManager
        // Released when the service stops; the timeout only guards against one that never does.
        wakeLock = power.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "readest:transfers").apply {
            setReferenceCounted(false)
            acquire(WAKE_LOCK_MAX_MS)
        }
    }

    private fun buildNotification(text: String): Notification {
        val manager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        val builder = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            manager.createNotificationChannel(
                NotificationChannel(CHANNEL_ID, "Transfers", NotificationManager.IMPORTANCE_LOW),
            )
            Notification.Builder(this, CHANNEL_ID)
        } else {
            @Suppress("DEPRECATION")
            Notification.Builder(this)
        }
        return builder
            .setSmallIcon(android.R.drawable.stat_sys_upload)
            .setContentTitle("Readest")
            .setContentText(text)
            .setOngoing(true)
            .build()
    }

    companion object {
        const val EXTRA_TEXT = "text"
        private const val CHANNEL_ID = "readest_transfers"
        private const val NOTIFICATION_ID = 4107
        private const val DEFAULT_TEXT = "Transferring books"
        private const val WAKE_LOCK_MAX_MS = 6L * 60 * 60 * 1000
    }
}
