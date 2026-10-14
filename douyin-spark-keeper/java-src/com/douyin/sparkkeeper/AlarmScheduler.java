package com.douyin.sparkkeeper;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import android.util.Log;
import java.util.Calendar;

public class AlarmScheduler {

    private static final String TAG = "AlarmSched";
    private static final int REQUEST_CODE = 77001;

    public static void scheduleDaily(Context ctx, int hour, int minute) {
        AlarmManager am = (AlarmManager) ctx.getSystemService(Context.ALARM_SERVICE);
        Intent intent = new Intent(ctx, AlarmReceiver.class);
        intent.putExtra("hour", hour);
        intent.putExtra("minute", minute);
        PendingIntent pi = PendingIntent.getBroadcast(
                ctx, REQUEST_CODE, intent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        Calendar next = Calendar.getInstance();
        next.set(Calendar.HOUR_OF_DAY, hour);
        next.set(Calendar.MINUTE, minute);
        next.set(Calendar.SECOND, 0);
        next.set(Calendar.MILLISECOND, 0);
        if (next.before(Calendar.getInstance())) {
            next.add(Calendar.DAY_OF_YEAR, 1);
        }
        long triggerAt = next.getTimeInMillis();
        Log.d(TAG, "计划下次运行: " + next.getTime());
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, triggerAt, pi);
        } else {
            am.setExact(AlarmManager.RTC_WAKEUP, triggerAt, pi);
        }
    }

    public static void cancelAll(Context ctx) {
        AlarmManager am = (AlarmManager) ctx.getSystemService(Context.ALARM_SERVICE);
        Intent intent = new Intent(ctx, AlarmReceiver.class);
        PendingIntent pi = PendingIntent.getBroadcast(
                ctx, REQUEST_CODE, intent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_NO_CREATE);
        if (pi != null) {
            am.cancel(pi);
            Log.d(TAG, "定时任务已取消");
        }
    }

    public static void triggerNow(Context ctx) {
        SparkForegroundService.start(ctx);
        SparkForegroundService.trigger(ctx);
        Log.d(TAG, "手动触发");
    }
}
