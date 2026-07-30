import { useMemo, useState } from 'react';
import { Text, View } from 'react-native';

import { Slider } from '@/components/slider';
import { useT } from '@/lib/i18n';
import { TEXT_SCALE } from '@/lib/settings';
import { useTheme } from '@/lib/theme';
import { makeListStyles } from '@/lib/ui-styles';

type Props = {
  scale: number;
  showArabic: boolean;
  showTranslation: boolean;
  /** Called once the finger lifts, not on every step. */
  onCommit: (scale: number) => void;
};

/**
 * Text size slider with a live sample.
 *
 * Owns the scale while dragging so only this subtree re-renders: handing every
 * step to the settings screen re-rendered the whole form and wrote to storage
 * on each one, which made the drag stutter.
 */
export function TextSizeControl({ scale, showArabic, showTranslation, onCommit }: Props) {
  const theme = useTheme();
  const t = useT();
  const styles = useMemo(() => makeListStyles(theme), [theme]);
  const [draft, setDraft] = useState(scale);
  const size = (n: number) => Math.round(n * draft);

  return (
    <>
      <View style={styles.sample}>
        {showArabic && (
          <Text style={[styles.sampleArabic, { fontSize: size(28), lineHeight: size(50) }]}>
            بِسْمِ ٱللَّهِ ٱلرَّحْمَـٰنِ ٱلرَّحِيمِ
          </Text>
        )}
        {showTranslation && (
          <Text style={[styles.sampleText, { fontSize: size(16), lineHeight: size(25) }]}>
            {t('sampleText')}
          </Text>
        )}
      </View>
      <Slider
        value={draft}
        min={TEXT_SCALE.min}
        max={TEXT_SCALE.max}
        step={TEXT_SCALE.step}
        label={t('textSize')}
        onChange={setDraft}
        onCommit={onCommit}
      />
    </>
  );
}
