import { useMemo } from "react";
import { Text } from "react-native";
import {
  useSettings,
  type PluginSurfaceProps,
  type SettingsState,
} from "@getpaseo/plugin/client";
import {
  SettingsAction,
  SettingsCard,
  SettingsRow,
  SettingsSection,
  SettingsSelect,
} from "@getpaseo/plugin/client/ui";
import { activitySettings, paletteModeSchema, displayModeSchema } from "../shared/settings";
import { setDisplayMode } from "./transform";

type ReadySettings = Extract<SettingsState<typeof activitySettings.schema>, { status: "ready" }>;

const displayModeOptions = [
  { value: "folded", label: "Folded (Claude style: > Thought · Ran X commands)" },
  { value: "detailed", label: "Separate cards (IDE style)" },
];

const displayModeDescriptions = {
  folded: "Group and fold all intermediate steps into a single compact line with click-to-expand details.",
  detailed: "Display each tool call and reasoning block as a separate row.",
} as const;

const paletteOptions = [
  { value: "vivid", label: "Vivid" },
  { value: "soft", label: "Soft" },
  { value: "high_contrast", label: "High contrast" },
];

const paletteDescriptions = {
  vivid: "Restrained category accents with neutral activity rows.",
  soft: "Mostly neutral icons with color reserved for status.",
  high_contrast: "Stronger dividers and status colors for easier scanning.",
} as const;

function ReadyControls({ settings, theme }: { settings: ReadySettings; theme: PluginSurfaceProps["theme"] }) {
  const descriptionStyle = useMemo(
    () => ({ color: theme.colors.foregroundMuted, fontSize: 13, lineHeight: 18 }),
    [theme.colors.foregroundMuted],
  );
  const errorStyle = useMemo(
    () => ({ color: theme.colors.statusDanger, fontSize: 13, lineHeight: 18 }),
    [theme.colors.statusDanger],
  );
  const changeDisplayMode = (value: string) => {
    const parsed = displayModeSchema.safeParse(value);
    if (!parsed.success) return;
    setDisplayMode(parsed.data);
    void settings.save({ ...settings.values, displayMode: parsed.data }, settings.revision);
  };
  const changePalette = (value: string) => {
    const parsed = paletteModeSchema.safeParse(value);
    if (!parsed.success) return;
    void settings.save({ ...settings.values, palette: parsed.data }, settings.revision);
  };
  return (
    <SettingsSection title="Activity display">
      <SettingsCard>
        <SettingsSelect
          label="Display mode"
          hint={displayModeDescriptions[settings.values.displayMode]}
          value={settings.values.displayMode}
          options={displayModeOptions}
          disabled={settings.saving}
          onValueChange={changeDisplayMode}
        />
        <SettingsSelect
          label="Palette"
          hint={paletteDescriptions[settings.values.palette]}
          value={settings.values.palette}
          options={paletteOptions}
          disabled={settings.saving}
          onValueChange={changePalette}
        />
      </SettingsCard>
      <SettingsRow label="Behavior">
        <Text style={descriptionStyle}>
          Folded mode groups all thoughts, shell commands, and file edits within a turn into a single clickable summary line (&gt; Thought · Ran X commands · Edited Y files). Detailed mode shows individual cards per tool call.
        </Text>
      </SettingsRow>
      {settings.saveError ? <Text accessibilityRole="alert" style={errorStyle}>{settings.saveError}</Text> : null}
    </SettingsSection>
  );
}

export function ActivitySettings({ theme }: PluginSurfaceProps) {
  const settings = useSettings(activitySettings);
  const textStyle = useMemo(() => ({ color: theme.colors.foreground }), [theme.colors.foreground]);
  if (settings.status === "loading") return <Text style={textStyle}>Loading settings…</Text>;
  if (settings.status === "error") {
    return (
      <SettingsSection title="Activity display">
        <Text style={textStyle}>{settings.error}</Text>
        <SettingsAction label="Settings" actionLabel="Reload" onPress={settings.reload} />
      </SettingsSection>
    );
  }
  if (settings.status === "invalid") {
    return (
      <SettingsSection title="Activity display">
        <Text style={textStyle}>{settings.error}</Text>
        <SettingsAction label="Stored settings" actionLabel="Reset" onPress={settings.reset} />
        <SettingsAction label="Stored settings" actionLabel="Reload" onPress={settings.reload} />
      </SettingsSection>
    );
  }
  return <ReadyControls settings={settings} theme={theme} />;
}
