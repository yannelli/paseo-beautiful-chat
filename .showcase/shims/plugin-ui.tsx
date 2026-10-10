// The host renders `@getpaseo/plugin/client/ui` and the package ships no runtime for it,
// so the screenshot harness gets plain React Native stand-ins with the same layout.
import React from "react";
import { Pressable, Switch, Text, View } from "react-native";

const label = { fontSize: 14, fontWeight: "600" as const, color: "#e5e5e5" };
const hint = { fontSize: 12, color: "#a3a3a3", marginTop: 2 };

export function SettingsSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={{ gap: 8 }}>
      <Text style={{ ...hint, textTransform: "uppercase" }}>{title}</Text>
      {children}
    </View>
  );
}

export function SettingsCard({ children }: { children: React.ReactNode }) {
  return <View style={{ borderWidth: 1, borderColor: "#333", borderRadius: 10 }}>{children}</View>;
}

export function SettingsRow(props: { label: string; hint?: string; children?: React.ReactNode }) {
  return (
    <View style={{ padding: 12, gap: 6 }}>
      <Text style={label}>{props.label}</Text>
      {props.hint ? <Text style={hint}>{props.hint}</Text> : null}
      {props.children}
    </View>
  );
}

export function SettingsSwitch(props: {
  label: string;
  hint?: string;
  value: boolean;
  onValueChange(value: boolean): void;
}) {
  return (
    <SettingsRow label={props.label} hint={props.hint}>
      <Switch value={props.value} onValueChange={props.onValueChange} />
    </SettingsRow>
  );
}

export function SettingsSelect(props: {
  label: string;
  hint?: string;
  value: string;
  options: ReadonlyArray<{ label: string; value: string }>;
}) {
  const current = props.options.find((option) => option.value === props.value);
  return (
    <SettingsRow label={props.label} hint={props.hint}>
      <Text style={hint}>{current?.label ?? props.value}</Text>
    </SettingsRow>
  );
}

export function SettingsAction(props: {
  label: string;
  hint?: string;
  actionLabel: string;
  onPress(): void;
}) {
  return (
    <SettingsRow label={props.label} hint={props.hint}>
      <Pressable onPress={props.onPress}>
        <Text style={label}>{props.actionLabel}</Text>
      </Pressable>
    </SettingsRow>
  );
}
