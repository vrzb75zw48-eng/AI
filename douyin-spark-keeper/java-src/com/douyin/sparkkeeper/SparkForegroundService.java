package com.douyin.sparkkeeper;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import android.os.IBinder;
import android.util.Log;

public class SparkForegroundService extends Service {

    private static final String TAG = "SparkFgSvc";
    private static final String CHANNEL_ID = "spark_fg";
    private static final int NOTIF_ID = 2024;

    public static void start(Context ctx) {
        Intent i = new Intent(ctx, SparkForegroundService.class);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            ctx.startForegroundService(i);
        } else {
            ctx.startService(i);
        }
    }

    public static void stop(Context ctx) {
        ctx.stopService(new Intent(ctx, SparkForegroundService.class));
    }

    public static void trigger(Context ctx) {
        Intent i = new Intent(ctx, SparkForegroundService.class);
        i.setAction("TRIGGER");
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            ctx.startForegroundService(i);
        } else {
            ctx.startService(i);
        }
    }

    @Override
    public void onCreate() {
        super.onCreate();
        createChannel();
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        startForeground(NOTIF_ID, buildNotification());
        if (intent != null && "TRIGGER".equals(intent.getAction())) {
            SparkAccessibilityService svc = SparkAccessibilityService.getInstance();
            if (svc != null) {
                svc.triggerAutomation();
            }
        }
        return START_NOT_STICKY;
    }

    @Override
    public void onDestroy() {
        Log.d(TAG, "前台服务已停止");
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) { return null; }

    private void createChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel ch = new NotificationChannel(
                    CHANNEL_ID, "SparkKeeper 前台服务",
                    NotificationManager.IMPORTANCE_LOW);
            ((NotificationManager) getSystemService(NOTIFICATION_SERVICE))
                    .createNotificationChannel(ch);
        }
    }

    private Notification buildNotification() {
        Notification.Builder b = (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O)
                ? new Notification.Builder(this, CHANNEL_ID)
                : new Notification.Builder(this);
        b.setContentTitle("SparkKeeper 运行中")
                .setContentText("自动续火花服务正在运行")
                .setSmallIcon(android.R.drawable.ic_dialog_info)
                .setOngoing(true);
        return b.build();
    }
}
