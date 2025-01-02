import { useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { AiOutlineOpenAI } from 'react-icons/ai';
import { Theme } from 'datocms-plugin-sdk';

/**
 * ChatbubbleTranslate.tsx
 *
 * This component renders a single chat bubble representing the translation status of a given field-locale pair.
 * It receives props describing the field being translated, the target locale, and the current status ('pending' or 'done').
 *
 * The component uses Framer Motion for animations:
 * - When status is 'pending', the bubble displays a spinning OpenAI icon to indicate ongoing translation.
 * - When the status changes to 'done', the bubble transitions smoothly, stops spinning, and can display a done state (e.g., a checkmark)..
 *
 * Props:
 * - bubble: {
 *     fieldLabel: string;   // The name/label of the field being translated.
 *     locale: string;       // The locale into which the field is being translated.
 *     status: 'pending'|'done'; // Current translation status for this field-locale.
 *     fieldPath: string;    // The path to the field in the CMS for potential navigation or identification.
 *   }
 * - theme: 'light'|'dark';  // Current theme provided by DatoCMS context for styling.
 * - index: number;          // Index of this bubble in the list for potential staggered animations.
 */

type BubbleType = {
  fieldLabel: string;
  locale: string;
  status: 'pending' | 'done';
  fieldPath: string;
};

type Props = {
  bubble: BubbleType;
  theme: Theme;
  index: number;
};

export function ChatBubble({ bubble, theme }: Props) {
  // Determine styling based on theme and status
  const backgroundColor = useMemo(() => {
    if (bubble.status === 'pending') {
      return theme.lightColor || 'rgb(242, 226, 254)';
    }
    return theme.semiTransparentAccentColor || 'rgba(114, 0, 196, 0.08)';
  }, [theme, bubble.status]);

  const textColor = useMemo(() => {
    if (bubble.status === 'pending') {
      return theme.darkColor || 'rgb(32, 0, 56)';
    }
    return theme.accentColor || 'rgb(114, 0, 196)';
  }, [theme, bubble.status]);

  const statusStyle = useMemo(() => {
    return {
      fontWeight: 600,
      color: textColor,
    };
  }, [textColor]);

  // Variants for framer-motion to animate bubble appearance and transitions
  const bubbleVariants = {
    initial: { opacity: 0, y: 20 },
    animate: { opacity: 1, y: 0 },
    exit: { opacity: 0, y: -20 },
  };

  // Conditional icon animation:
  // - If status is 'pending', rotate continuously.
  // - If status is 'done', stop rotation (no animation).
  const iconAnimation =
    bubble.status === 'pending'
      ? {
          rotate: [0, 360],
          transition: {
            duration: 1,
            ease: 'linear',
            repeat: Infinity,
          },
        }
      : {
          rotate: 0,
          transition: { duration: 0.2 },
        };

  // Icon to indicate status: same OpenAI icon, but spinning if pending, static if done
  // Could switch icon if desired, but instructions say not to remove/change functionality.
  // We'll keep the same icon and just stop spinning when done.
  return (
    <AnimatePresence>
      <motion.div
        key={bubble.fieldLabel + bubble.locale}
        variants={bubbleVariants}
        initial="initial"
        animate="animate"
        exit="exit"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          backgroundColor,
          color: textColor,
          padding: '12px 16px',
          borderRadius: '12px',
          marginBottom: '8px',
          fontFamily:
            '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
          fontSize: '14px',
          lineHeight: '1.4',
          letterSpacing: '0.01em',
          boxShadow: '0 1px 2px rgba(0, 0, 0, 0.05)',
          cursor: 'pointer',
          border: `1px solid ${
            theme.semiTransparentAccentColor || 'rgba(114, 0, 196, 0.1)'
          }`,
        }}
      >
        {/* OpenAI icon with animation */}
        <motion.div
          style={{
            display: 'flex',
            color: textColor,
          }}
          animate={iconAnimation}
        >
          <AiOutlineOpenAI size={20} />
        </motion.div>

        {/* Display text message with enhanced formatting */}
        <div style={{ flex: 1 }}>
          <span style={{ fontWeight: 500 }}>
            {bubble.status === 'pending' ? (
              <>
                "<strong style={statusStyle}>{bubble.fieldLabel}</strong>" to{' '}
                <strong style={statusStyle}>{bubble.locale}</strong>...
              </>
            ) : (
              <>
                "<strong style={statusStyle}>{bubble.fieldLabel}</strong>" to{' '}
                <strong style={statusStyle}>{bubble.locale}</strong>
              </>
            )}
          </span>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
