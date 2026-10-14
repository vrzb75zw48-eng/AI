package com.douyin.sparkkeeper;

import android.app.Activity;
import android.content.Intent;
import android.os.Bundle;
import android.view.View;
import android.widget.*;

public class DiscoveryActivity extends Activity {

    private Button btnLaunchDouyin;
    private Button btnDump;
    private Button btnTrigger;
    private TextView tvResult;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_discovery);

        btnLaunchDouyin = findViewById(R.id.btnLaunchDouyin);
        btnDump = findViewById(R.id.btnDump);
        btnTrigger = findViewById(R.id.btnTrigger);
        tvResult = findViewById(R.id.tvResult);

        btnLaunchDouyin.setOnClickListener(v -> {
            SparkAccessibilityService svc = SparkAccessibilityService.getInstance();
            if (svc != null) {
                DouyinNavigator nav = new DouyinNavigator(svc);
                nav.launchDouyin(this);
                tvResult.setText("已启动抖音");
            } else {
                tvResult.setText("无障碍服务未运行");
            }
        });

        btnDump.setOnClickListener(v -> {
            SparkAccessibilityService svc = SparkAccessibilityService.getInstance();
            if (svc != null) {
                String path = svc.dumpUiTreeNow();
                tvResult.setText("转储: " + path);
            } else {
                tvResult.setText("无障碍服务未运行");
            }
        });

        btnTrigger.setOnClickListener(v -> {
            SparkAccessibilityService svc = SparkAccessibilityService.getInstance();
            if (svc != null) {
                svc.triggerAutomation();
                tvResult.setText("已触发自动化");
            } else {
                tvResult.setText("无障碍服务未运行");
            }
        });
    }
}
