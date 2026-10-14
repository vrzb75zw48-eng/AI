package com.douyin.sparkkeeper;

import android.accessibilityservice.AccessibilityService;
import android.content.Intent;
import android.os.Handler;
import android.os.Looper;
import android.util.Log;
import android.view.accessibility.AccessibilityEvent;

import java.util.List;

public class SparkAccessibilityService extends AccessibilityService {

    public static final String BROADCAST_RESULT = "com.douyin.sparkkeeper.RESULT";
    public static final String EXTRA_RESULT_KEY = "result";

    private static final String TAG = "SparkAccSvc";
    private static volatile SparkAccessibilityService instance = null;

    private final Handler mainHandler = new Handler(Looper.getMainLooper());
    private DouyinNavigator navigator;
    private volatile boolean isBusy = false;

    public static SparkAccessibilityService getInstance() {
        return instance;
    }

    public static boolean isRunning() {
        return instance != null;
    }

    @Override
    public void onServiceConnected() {
        super.onServiceConnected();
        instance = this;
        navigator = new DouyinNavigator(this);
        Log.d(TAG, "AccessibilityService 已连接");
    }

    @Override
    public void onAccessibilityEvent(AccessibilityEvent event) {
    }

    @Override
    public void onInterrupt() {}

    public void triggerAutomation() {
        if (isBusy) {
            Log.w(TAG, "已有任务在运行，跳过");
            return;
        }
        isBusy = true;
        final SparksConfig.SparkConfig cfg = SparksConfig.load(this);

        mainHandler.post(() -> {
            if (cfg.contacts.isEmpty()) {
                Log.w(TAG, "联系人列表为空");
                notifyResult("空联系人列表");
                isBusy = false;
                return;
            }
            navigator.runAutomation(cfg.contacts, cfg.message, new Callbacks() {
                @Override
                public void onDone(String result) {
                    isBusy = false;
                    notifyResult(result);
                }
            });
        });
    }

    public void triggerDump() {
        mainHandler.post(() -> {
            String path = navigator.dumpUiTree();
            notifyResult(path != null ? path : "dump_failed");
        });
    }

    public String dumpUiTreeNow() {
        return navigator.dumpUiTree();
    }

    private void notifyResult(String result) {
        sendBroadcast(new Intent(BROADCAST_RESULT)
                .setPackage(getPackageName())
                .putExtra(EXTRA_RESULT_KEY, result));
    }

    @Override
    public void onDestroy() {
        if (instance == this) instance = null;
        Log.d(TAG, "AccessibilityService 已销毁");
        super.onDestroy();
    }

    public interface Callbacks {
        void onDone(String result);
    }
}
