package com.douyin.sparkkeeper;

import android.accessibilityservice.AccessibilityService;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.content.pm.ResolveInfo;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.util.Log;
import android.view.accessibility.AccessibilityNodeInfo;

import java.io.File;
import java.io.FileWriter;
import java.io.IOException;
import java.util.ArrayList;
import java.util.List;

public class DouyinNavigator {

    public static final String DOYIN_PACKAGE = "com.ss.android.ugc.aweme";
    private static final String TAG = "DouyinNav";

    private static final String[] INPUT_VIEW_IDS = {
            "com.ss.android.ugc.aweme:id/aweme_input",
            "com.ss.android.ugc.aweme:id/chat_input",
            "com.ss.android.ugc.aweme:id/et_content",
            "com.ss.android.ugc.aweme:id/message_input"
    };

    private static final String[] SEND_VIEW_IDS = {
            "com.ss.android.ugc.aweme:id/btn_send",
            "com.ss.android.ugc.aweme:id/send_btn"
    };

    private static final String[] MESSAGE_TAB_IDS = {
            "com.ss.android.ugc.aweme:id/message_tab",
            "com.ss.android.ugc.aweme:id/tab_message",
            "com.ss.android.ugc.aweme:id/bottom_tab_msg"
    };

    private final SparkAccessibilityService service;
    private final Handler mainHandler;

    public DouyinNavigator(SparkAccessibilityService service) {
        this.service = service;
        this.mainHandler = new Handler(Looper.getMainLooper());
    }

    public boolean isDouyinForeground() {
        return service.getRootInActiveWindow() != null
                && DOYIN_PACKAGE.equals(service.getRootInActiveWindow().getPackageName());
    }

    public void launchDouyin(Context context) {
        try {
            Intent intent = new Intent(Intent.ACTION_MAIN)
                    .addCategory(Intent.CATEGORY_LAUNCHER);
            intent.setPackage(DOYIN_PACKAGE);
            PackageManager pm = context.getPackageManager();
            List<ResolveInfo> matches = pm.queryIntentActivities(intent, 0);
            if (!matches.isEmpty()) {
                ResolveInfo ri = matches.get(0);
                ComponentName cn = new ComponentName(ri.activityInfo.packageName, ri.activityInfo.name);
                Intent launch = new Intent();
                launch.setComponent(cn);
                launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                context.startActivity(launch);
                Log.d(TAG, "已启动抖音");
            } else {
                Log.w(TAG, "未找到抖音启动 Activity（未安装？）");
            }
        } catch (Exception e) {
            Log.e(TAG, "启动抖音失败", e);
        }
    }

    public boolean waitForDouyin(int timeoutMs) {
        long deadline = System.currentTimeMillis() + timeoutMs;
        while (System.currentTimeMillis() < deadline) {
            if (isDouyinForeground()) return true;
            try { Thread.sleep(500); } catch (InterruptedException e) { break; }
        }
        return false;
    }

    public void runAutomation(final List<String> contacts, final String msg,
                              final SparkAccessibilityService.Callbacks callbacks) {
        Log.d(TAG, "开始自动化：" + contacts.size() + " 个联系人");
        launchDouyin(service);

        new Thread(() -> {
            if (!waitForDouyin(8000)) {
                mainHandler.post(() -> Log.w(TAG, "等待抖音超时"));
                callbacks.onDone("timeout");
                return;
            }
            mainHandler.postDelayed(new Runnable() {
                @Override public void run() {
                    if (!navigateToMessages()) {
                        Log.w(TAG, "无法导航到消息页");
                        callbacks.onDone("nav_failed");
                        return;
                    }
                    mainHandler.postDelayed(() -> processContacts(0, contacts, msg, callbacks), 2000);
                }
            }, 3000);
        }).start();
    }

    private void processContacts(final int idx, final List<String> contacts,
                                 final String msg, final SparkAccessibilityService.Callbacks callbacks) {
        if (idx >= contacts.size()) {
            Log.d(TAG, "完成：" + (idx) + "/" + contacts.size());
            callbacks.onDone("done");
            return;
        }
        final String name = contacts.get(idx);
        mainHandler.postDelayed(() -> {
            if (openContact(name)) {
                mainHandler.postDelayed(() -> {
                    if (sendChatMessage(msg)) {
                        Log.d(TAG, "✓ " + name);
                    } else {
                        Log.w(TAG, "✗ 发送失败: " + name);
                    }
                    goBack();
                    mainHandler.postDelayed(
                            () -> processContacts(idx + 1, contacts, msg, callbacks), 2000);
                }, 1500);
            } else {
                Log.w(TAG, "✗ 未找到联系人: " + name);
                mainHandler.postDelayed(
                        () -> processContacts(idx + 1, contacts, msg, callbacks), 1000);
            }
        }, 800);
    }

    public boolean navigateToMessages() {
        AccessibilityNodeInfo root = service.getRootInActiveWindow();
        if (root == null) return false;
        for (String id : MESSAGE_TAB_IDS) {
            List<AccessibilityNodeInfo> nodes = root.findAccessibilityNodeInfosByViewId(id);
            if (!nodes.isEmpty() && nodes.get(0).performAction(AccessibilityNodeInfo.ACTION_CLICK)) {
                Log.d(TAG, "通过 viewId=" + id + " 点击消息 tab");
                return true;
            }
        }
        for (AccessibilityNodeInfo node : root.findAccessibilityNodeInfosByText("消息")) {
            String text = node.getText() != null ? node.getText().toString() : "";
            String desc = node.getContentDescription() != null ? node.getContentDescription().toString() : "";
            if (text.equals("消息") || desc.contains("消息")) {
                if (node.performAction(AccessibilityNodeInfo.ACTION_CLICK)) {
                    Log.d(TAG, "通过文本点击消息 tab");
                    return true;
                }
            }
        }
        Log.w(TAG, "未找到消息 tab");
        return false;
    }

    public boolean openContact(String name) {
        AccessibilityNodeInfo root = service.getRootInActiveWindow();
        if (root == null) return false;
        List<AccessibilityNodeInfo> nodes = root.findAccessibilityNodeInfosByText(name);
        for (AccessibilityNodeInfo node : nodes) {
            String text = node.getText() != null ? node.getText().toString() : "";
            String desc = node.getContentDescription() != null ? node.getContentDescription().toString() : "";
            if (text.equals(name) || (desc.startsWith(name) && !desc.isEmpty())) {
                if (node.performAction(AccessibilityNodeInfo.ACTION_CLICK)) {
                    Log.d(TAG, "点击联系人 " + name);
                    return true;
                }
            }
        }
        for (AccessibilityNodeInfo node : nodes) {
            if (node.performAction(AccessibilityNodeInfo.ACTION_CLICK)) {
                Log.d(TAG, "包含匹配点击 " + name);
                return true;
            }
        }
        return false;
    }

    public boolean sendChatMessage(String msg) {
        AccessibilityNodeInfo root = service.getRootInActiveWindow();
        if (root == null) return false;

        AccessibilityNodeInfo input = findInputField(root);
        if (input == null) {
            Log.w(TAG, "未找到输入框");
            return false;
        }
        Bundle args = new Bundle();
        args.putCharSequence(AccessibilityNodeInfo.ACTION_ARGUMENT_SET_TEXT_CHARSEQUENCE, msg);
        if (!input.performAction(AccessibilityNodeInfo.ACTION_SET_TEXT, args)) {
            Log.w(TAG, "设置文本失败");
            return false;
        }
        try { Thread.sleep(300); } catch (InterruptedException ignored) {}
        return clickSendButton();
    }

    private AccessibilityNodeInfo findInputField(AccessibilityNodeInfo root) {
        for (String id : INPUT_VIEW_IDS) {
            List<AccessibilityNodeInfo> nodes = root.findAccessibilityNodeInfosByViewId(id);
            if (!nodes.isEmpty() && nodes.get(0).isEditable()) return nodes.get(0);
        }
        List<AccessibilityNodeInfo> editable = new ArrayList<>();
        collectEditable(root, editable, 0);
        Log.d(TAG, "找到 " + editable.size() + " 个可编辑字段");
        return editable.isEmpty() ? null : editable.get(0);
    }

    private void collectEditable(AccessibilityNodeInfo node, List<AccessibilityNodeInfo> results, int depth) {
        if (depth > 30) return;
        if ("android.widget.EditText".equals(node.getClassName()) && node.isEditable()) {
            results.add(node);
        }
        for (int i = 0; i < node.getChildCount(); i++) {
            AccessibilityNodeInfo child = node.getChild(i);
            if (child != null) collectEditable(child, results, depth + 1);
        }
    }

    private boolean clickSendButton() {
        AccessibilityNodeInfo root = service.getRootInActiveWindow();
        if (root == null) return false;
        for (String id : SEND_VIEW_IDS) {
            List<AccessibilityNodeInfo> nodes = root.findAccessibilityNodeInfosByViewId(id);
            if (!nodes.isEmpty() && nodes.get(0).isClickable()
                    && nodes.get(0).performAction(AccessibilityNodeInfo.ACTION_CLICK))
                return true;
        }
        for (AccessibilityNodeInfo node : root.findAccessibilityNodeInfosByText("发送")) {
            if (node.isClickable() && node.performAction(AccessibilityNodeInfo.ACTION_CLICK))
                return true;
        }
        Log.d(TAG, "发送按钮未找到，无法发送");
        return false;
    }

    public void goBack() {
        service.performGlobalAction(AccessibilityService.GLOBAL_ACTION_BACK);
    }

    public String dumpUiTree() {
        AccessibilityNodeInfo root = service.getRootInActiveWindow();
        if (root == null) return null;
        StringBuilder sb = new StringBuilder();
        sb.append("=== UI Dump: ").append(root.getPackageName()).append("\n");
        walk(root, sb, 0);
        try {
            File dir = service.getExternalFilesDir(null);
            if (dir == null) dir = service.getFilesDir();
            if (!dir.exists()) dir.mkdirs();
            File file = new File(dir, "dump_" + System.currentTimeMillis() + ".txt");
            FileWriter fw = new FileWriter(file);
            fw.write(sb.toString());
            fw.close();
            Log.d(TAG, "UI 树已写入: " + file.getAbsolutePath());
            return file.getAbsolutePath();
        } catch (IOException e) {
            Log.e(TAG, "写入失败", e);
            return null;
        }
    }

    private void walk(AccessibilityNodeInfo node, StringBuilder sb, int depth) {
        if (depth > 30) return;
        StringBuilder indent = new StringBuilder();
        for (int i = 0; i < depth; i++) indent.append("  ");
        String text = node.getText() != null ? node.getText().toString() : "";
        if (text.length() > 60) text = text.substring(0, 60) + "...";
        String desc = node.getContentDescription() != null ? node.getContentDescription().toString() : "";
        String viewId;
        try {
            java.lang.reflect.Method m = AccessibilityNodeInfo.class.getDeclaredMethod("getViewId");
            m.setAccessible(true);
            viewId = String.valueOf(m.invoke(node));
        } catch (Exception e) {
            viewId = "N/A";
        }
        sb.append(String.format("%s[depth=%d] class=%s text=%s desc=%s viewId=%s clickable=%b editable=%b scrollable=%b\n",
                indent, depth, node.getClassName(), text, desc, viewId,
                node.isClickable(), node.isEditable(), node.isScrollable()));
        for (int i = 0; i < node.getChildCount(); i++) {
            AccessibilityNodeInfo child = node.getChild(i);
            if (child != null) walk(child, sb, depth + 1);
        }
    }
}
