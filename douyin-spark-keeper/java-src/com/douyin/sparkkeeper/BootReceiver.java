package com.douyin.sparkkeeper;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.util.Log;

public class BootReceiver extends BroadcastReceiver {
    private static final String TAG = "BootRecv";

    @Override
    public void onReceive(Context context, Intent intent) {
        if (Intent.ACTION_BOOT_COMPLETED.equals(intent.getAction())) {
            Log.d(TAG, "开机完成，恢复服务");
            SparksConfig.SparkConfig cfg = SparksConfig.load(context);
            if (cfg.isEnabled) {
                SparkForegroundService.start(context);
                AlarmScheduler.scheduleDaily(context, cfg.scheduleHour, cfg.scheduleMinute);
            }
        }
    }
}
