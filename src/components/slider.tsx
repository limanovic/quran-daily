import { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, LayoutChangeEvent, PanResponder, StyleSheet, View } from 'react-native';

import { Theme, useTheme } from '@/lib/theme';

type Props = {
  value: number;
  min: number;
  max: number;
  step: number;
  label: string;
  /** Fires on every step crossed while dragging. */
  onChange: (value: number) => void;
  /** Fires once when the finger lifts — the place to persist. */
  onCommit?: (value: number) => void;
};

/**
 * Minimal stepped slider on top of PanResponder — the community slider is a
 * native module, and this needs no rebuild. Drag or tap anywhere on the track.
 *
 * The thumb follows the finger continuously through an Animated.Value (no React
 * render per frame) while the reported value snaps to `step`, so the drag stays
 * smooth even though the value it produces is coarse.
 */
export function Slider({ value, min, max, step, label, onChange, onCommit }: Props) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const [width, setWidth] = useState(0);
  const ratio = useRef(new Animated.Value((value - min) / (max - min))).current;
  const dragging = useRef(false);

  // The responder is created once, so it must read the live props rather than
  // the ones captured on first render.
  const props = useRef({ value, min, max, step, onChange, onCommit, width });
  props.current = { value, min, max, step, onChange, onCommit, width };

  // Follow changes that come from outside a drag (a11y nudges, a reset).
  useEffect(() => {
    if (!dragging.current) ratio.setValue((value - min) / (max - min));
  }, [value, min, max, ratio]);

  // Where the finger landed, and the ratio it landed on. Moves are measured as
  // a delta from these: locationX during a move is relative to whichever child
  // is under the finger, which reads as ~0 as soon as you cross the thumb.
  const origin = useRef({ pageX: 0, ratio: 0 });

  const apply = (raw: number) => {
    const clamped = Math.min(1, Math.max(0, raw));
    ratio.setValue(clamped);
    const { min: lo, max: hi, step: by } = props.current;
    const snapped = Math.round((lo + clamped * (hi - lo)) / by) * by;
    const next = Number(Math.min(hi, Math.max(lo, snapped)).toFixed(2));
    if (next !== props.current.value) props.current.onChange(next);
  };

  const responder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      // Claim the gesture so the surrounding ScrollView doesn't steal the drag.
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: (e) => {
        const w = props.current.width;
        const start = w > 0 ? Math.min(1, Math.max(0, e.nativeEvent.locationX / w)) : 0;
        origin.current = { pageX: e.nativeEvent.pageX, ratio: start };
        dragging.current = true;
        apply(start);
      },
      onPanResponderMove: (e) => {
        const w = props.current.width;
        if (w <= 0) return;
        apply(origin.current.ratio + (e.nativeEvent.pageX - origin.current.pageX) / w);
      },
      onPanResponderRelease: () => {
        dragging.current = false;
        props.current.onCommit?.(props.current.value);
      },
      onPanResponderTerminate: () => {
        dragging.current = false;
        props.current.onCommit?.(props.current.value);
      },
    }),
  ).current;

  const nudge = (direction: 1 | -1) => {
    const { min: lo, max: hi, step: by, value: current } = props.current;
    const next = Number(Math.min(hi, Math.max(lo, current + direction * by)).toFixed(2));
    if (next === current) return;
    props.current.onChange(next);
    props.current.onCommit?.(next);
  };

  const offset = ratio.interpolate({ inputRange: [0, 1], outputRange: [0, width] });
  const percent = (value - min) / (max - min);

  return (
    <View
      style={styles.hitArea}
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel={label}
      accessibilityValue={{ min: 0, max: 100, now: Math.round(percent * 100) }}
      accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
      onAccessibilityAction={(e) => nudge(e.nativeEvent.actionName === 'increment' ? 1 : -1)}
      onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width)}
      {...responder.panHandlers}
    >
      {/* None of the visuals may take the touch: the responder must stay on
          the container so grant coordinates are always track-relative. */}
      <View style={styles.track} pointerEvents="none">
        <Animated.View style={[styles.fill, { width: offset }]} />
      </View>
      <Animated.View
        style={[styles.thumb, { transform: [{ translateX: offset }] }]}
        pointerEvents="none"
      />
    </View>
  );
}

function makeStyles(theme: Theme) {
  return StyleSheet.create({
    // 44pt tall so the touch target clears the minimum even though the track
    // it contains is 4pt.
    hitArea: { height: 44, justifyContent: 'center' },
    track: { height: 4, borderRadius: 2, backgroundColor: theme.accentSoft, overflow: 'hidden' },
    fill: { height: 4, backgroundColor: theme.accent },
    thumb: {
      position: 'absolute',
      left: -12,
      width: 24,
      height: 24,
      borderRadius: 12,
      backgroundColor: theme.accent,
      borderWidth: 2,
      borderColor: theme.surface,
    },
  });
}
