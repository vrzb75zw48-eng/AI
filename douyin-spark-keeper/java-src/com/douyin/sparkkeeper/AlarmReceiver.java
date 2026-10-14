package com.douyin.sparkkeeper;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.util.Log;

public class AlarmReceiver extends BroadcastReceiver {
    private static final String TAG = "AlarmRecv";

    @Override
    public void onReceive(Context context, Intent intent) {
        Log.d(TAG, "收到定时触发");
        int hour = intent.getIntExtra("hour", 20);
        int minute = intent.getIntExtra("minute", 0);
        SparksConfig.saveSchedule(context, hour, minute);
        SparkForegroundService.start(context);
        SparkAccessibilityService svc = SparkAccessibilityService.getInstance();
        if (svc != null) {
            svc.triggerAutomation();
        } else {
            Log.w(TAG, "无障碍服务未运行，跳过");
        }
        AlarmScheduler.scheduleDaily(context, hour, minute);
    }
}
