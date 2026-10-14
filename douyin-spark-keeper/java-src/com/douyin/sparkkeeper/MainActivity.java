package com.douyin.sparkkeeper;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.provider.Settings;
import android.view.View;
import android.widget.*;

import java.util.ArrayList;
import java.util.List;

public class MainActivity extends Activity {

    private TextView tvAccStatus;
    private Button btnEnableAcc;
    private Button btnToggleService;
    private EditText etNewContact;
    private Button btnAddContact;
    private ListView lvContacts;
    private EditText etScheduleHour;
    private EditText etScheduleMinute;
    private EditText etMessage;
    private Button btnManualTrigger;
    private Button btnQuickSend;
    private Button btnDiscovery;

    private List<String> contacts = new ArrayList<>();
    private ArrayAdapter<String> adapter;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_main);

        tvAccStatus = findViewById(R.id.tvAccessibilityStatus);
        btnEnableAcc = findViewById(R.id.btnEnableAccessibility);
        btnToggleService = findViewById(R.id.btnToggleService);
        etNewContact = findViewById(R.id.etNewContact);
        btnAddContact = findViewById(R.id.btnAddContact);
        lvContacts = findViewById(R.id.lvContacts);
        etScheduleHour = findViewById(R.id.etScheduleHour);
        etScheduleMinute = findViewById(R.id.etScheduleMinute);
        etMessage = findViewById(R.id.etMessage);
        btnManualTrigger = findViewById(R.id.btnManualTrigger);
        btnQuickSend = findViewById(R.id.btnQuickSend);
        btnDiscovery = findViewById(R.id.btnDiscovery);

        adapter = new ArrayAdapter<>(this, android.R.layout.simple_list_item_1, contacts);
        lvContacts.setAdapter(adapter);
        lvContacts.setOnItemLongClickListener(new AdapterView.OnItemLongClickListener() {
            @Override
            public boolean onItemLongClick(AdapterView<?> parent, View view, int position, long id) {
                final String name = contacts.get(position);
                new AlertDialog.Builder(MainActivity.this)
                        .setTitle("移除联系人")
                        .setMessage(name)
                        .setPositiveButton("移除", (d, w) -> {
                            SparksConfig.removeContact(MainActivity.this, name);
                            contacts.remove(position);
                            adapter.notifyDataSetChanged();
                        })
                        .setNegativeButton("取消", null)
                        .show();
                return true;
            }
        });

        btnAddContact.setOnClickListener(v -> {
            String name = etNewContact.getText().toString().trim();
            if (!name.isEmpty()) {
                SparksConfig.addContact(this, name);
                if (!contacts.contains(name)) contacts.add(name);
                adapter.notifyDataSetChanged();
                etNewContact.setText("");
            }
        });

        btnToggleService.setOnClickListener(v -> toggleService());
        btnEnableAcc.setOnClickListener(v -> openAccessibilitySettings());
        btnManualTrigger.setOnClickListener(v -> AlarmScheduler.triggerNow(this));
        btnQuickSend.setOnClickListener(v -> quickSend());
        btnDiscovery.setOnClickListener(v ->
                startActivity(new Intent(this, DiscoveryActivity.class)));

        SparksConfig.SparkConfig cfg = SparksConfig.load(this);
        contacts.clear();
        contacts.addAll(cfg.contacts);
        adapter.notifyDataSetChanged();
        etScheduleHour.setText(String.valueOf(cfg.scheduleHour));
        etScheduleMinute.setText(String.valueOf(cfg.scheduleMinute));
        etMessage.setText(cfg.message);
    }

    @Override
    protected void onResume() {
        super.onResume();
        boolean accEnabled = SparkAccessibilityService.isRunning();
        if (accEnabled) {
            tvAccStatus.setVisibility(View.GONE);
            btnEnableAcc.setVisibility(View.GONE);
        } else {
            tvAccStatus.setVisibility(View.VISIBLE);
            tvAccStatus.setText("⚠ 请先开启无障碍服务才能自动操作抖音");
            btnEnableAcc.setVisibility(View.VISIBLE);
        }
    }

    private void openAccessibilitySettings() {
        startActivity(new Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS));
    }

    private int parseHour() {
        try { return Integer.parseInt(etScheduleHour.getText().toString().trim()); }
        catch (NumberFormatException e) { return 20; }
    }

    private int parseMinute() {
        try { return Integer.parseInt(etScheduleMinute.getText().toString().trim()); }
        catch (NumberFormatException e) { return 0; }
    }

    private void toggleService() {
        SparksConfig.SparkConfig cfg = SparksConfig.load(this);
        if (cfg.isEnabled) {
            SparkForegroundService.stop(this);
            AlarmScheduler.cancelAll(this);
            SparksConfig.setEnabled(this, false);
            btnToggleService.setText("启动前台服务");
            toast("服务已停止");
        } else {
            if (!SparkAccessibilityService.isRunning()) {
                toast("请先开启无障碍服务");
                openAccessibilitySettings();
                return;
            }
            int hour = parseHour();
            int minute = parseMinute();
            String msg = etMessage.getText().toString().trim();
            if (msg.isEmpty()) msg = "🔥 火花+1";

            SparksConfig.saveSchedule(this, hour, minute);
            SparksConfig.saveMessage(this, msg);
            SparksConfig.setEnabled(this, true);

            SparkForegroundService.start(this);
            AlarmScheduler.scheduleDaily(this, hour, minute);
            btnToggleService.setText("停止前台服务");
            toast("服务已启动，每天 " + hour + ":" + String.format("%02d", minute) + " 自动执行");
        }
    }

    private void quickSend() {
        if (!SparkAccessibilityService.isRunning()) {
            toast("请先开启无障碍服务");
            openAccessibilitySettings();
            return;
        }
        SparksConfig.SparkConfig cfg = SparksConfig.load(this);
        if (cfg.contacts.isEmpty()) {
            toast("请先添加联系人");
            return;
        }
        String msg = etMessage.getText().toString().trim();
        if (msg.isEmpty()) msg = "🔥 火花+1";
        SparksConfig.saveMessage(this, msg);
        SparksConfig.saveSchedule(this, parseHour(), parseMinute());
        SparkForegroundService.start(this);
        AlarmScheduler.triggerNow(this);
        toast("正在打开抖音发送消息…");
    }

    private void toast(String msg) {
        Toast.makeText(this, msg, Toast.LENGTH_SHORT).show();
    }
}
