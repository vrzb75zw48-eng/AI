package com.douyin.sparkkeeper;

import android.content.Context;
import android.content.SharedPreferences;
import java.util.ArrayList;
import java.util.List;

public class SparksConfig {
    private static final String PREFS = "spark_keeper_prefs";

    public static class SparkConfig {
        public List<String> contacts = new ArrayList<>();
        public String message = "🔥 火花+1";
        public int scheduleHour = 20;
        public int scheduleMinute = 0;
        public boolean isEnabled = false;
    }

    public static SparkConfig load(Context ctx) {
        SharedPreferences p = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        SparkConfig cfg = new SparkConfig();
        cfg.contacts.addAll(p.getStringSet("contacts", new java.util.HashSet<>()));
        cfg.message = p.getString("message", "🔥 火花+1");
        cfg.scheduleHour = p.getInt("sched_hour", 20);
        cfg.scheduleMinute = p.getInt("sched_minute", 0);
        cfg.isEnabled = p.getBoolean("service_enabled", false);
        return cfg;
    }

    public static void addContact(Context ctx, String name) {
        SharedPreferences p = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        java.util.Set<String> s = new java.util.HashSet<>(p.getStringSet("contacts", new java.util.HashSet<>()));
        s.add(name.trim());
        p.edit().putStringSet("contacts", s).apply();
    }

    public static void removeContact(Context ctx, String name) {
        SharedPreferences p = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        java.util.Set<String> s = new java.util.HashSet<>(p.getStringSet("contacts", new java.util.HashSet<>()));
        s.remove(name);
        p.edit().putStringSet("contacts", s).apply();
    }

    public static void saveSchedule(Context ctx, int hour, int minute) {
        ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit()
                .putInt("sched_hour", hour)
                .putInt("sched_minute", minute)
                .apply();
    }

    public static void saveMessage(Context ctx, String msg) {
        ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit()
                .putString("message", msg)
                .apply();
    }

    public static void setEnabled(Context ctx, boolean enabled) {
        ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit()
                .putBoolean("service_enabled", enabled)
                .apply();
    }
}
