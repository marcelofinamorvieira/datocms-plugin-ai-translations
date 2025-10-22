import { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { AiOutlineOpenAI } from 'react-icons/ai';
import { BsCheckCircleFill } from 'react-icons/bs';
import type { Theme } from 'datocms-plugin-sdk';
import styles from '../../../styles.module.css';
import locale from 'locale-codes';

const localeSelect = locale.getByTag;
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
  id: string; // stable unique id (e.g., api_key.locale)
  fieldLabel: string;
  locale: string;
  status: 'pending' | 'done';
  fieldPath: string;
  streamingContent?: string;
};

type Props = {
  bubble: BubbleType;
  theme: Theme;
  index: number;
};

export function ChatBubble({ bubble, theme }: Props) {
  const [isHovered, setIsHovered] = useState(false);

  // Theme-based styles that can't be in CSS
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

  const tooltipBackgroundColor = useMemo(() => {
    return theme.semiTransparentAccentColor || 'rgba(114, 0, 196, 0.08)';
  }, [theme]);

  const tooltipTextColor = useMemo(() => {
    return theme.darkColor ? `${theme.darkColor}99` : 'rgba(32, 0, 56, 0.6)';
  }, [theme]);

  const truncatedContent = useMemo(() => {
    if (!bubble.streamingContent) return '';
    const content = bubble.streamingContent.trim();
    if (content.length <= 100 || isHovered) return content;
    return `${content.slice(-100)}...`;
  }, [bubble.streamingContent, isHovered]);

  // Variants for framer-motion to animate bubble appearance and transitions
  const bubbleVariants = {
    initial: { opacity: 0, y: 20 },
    animate: { opacity: 1, y: 0 },
    exit: { opacity: 0, y: -20 },
  };

  const tooltipVariants = {
    initial: {
      opacity: 0,
      scale: 0.95,
    },
    animate: {
      opacity: 1,
      scale: 1,
      transition: {
        opacity: {
          duration: 0.2,
          ease: 'easeOut',
        },
        scale: {
          duration: 0.2,
          ease: 'easeOut',
        },
      },
    },
    exit: {
      opacity: 0,
      scale: 0.95,
      transition: {
        opacity: {
          duration: 0.15,
          ease: 'easeIn',
        },
        scale: {
          duration: 0.15,
          ease: 'easeIn',
        },
      },
    },
  };

  const streamingTextVariants = {
    initial: { opacity: 0 },
    animate: {
      opacity: 1,
      transition: {
        opacity: { duration: 0.3 },
      },
    },
    exit: {
      opacity: 0,
      transition: {
        opacity: { duration: 0.2 },
      },
    },
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
            repeat: Number.POSITIVE_INFINITY,
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
        key={bubble.id}
        layout
        variants={bubbleVariants}
        initial="initial"
        animate="animate"
        exit="exit"
        className={`${styles.bubbleContainer} ${
          bubble.status === 'done' ? styles.done : ''
        }`}
      >
        <motion.div
          className={styles.bubble}
          style={{
            backgroundColor,
            color: textColor,
            border: `1px solid ${
              theme.semiTransparentAccentColor || 'rgba(114, 0, 196, 0.1)'
            }`,
          }}
        >
          <motion.div
            className={styles.bubbleIcon}
            style={{ color: textColor }}
            animate={iconAnimation}
          >
            <AiOutlineOpenAI size={20} />
          </motion.div>

          <div className={styles.bubbleContent}>
            <span className={styles.bubbleText}>
              <>
                “<strong>{bubble.fieldLabel}</strong>” to{' '}
                <strong>{localeSelect(bubble.locale)?.name}</strong>{' '}
                [<code>{bubble.locale}</code>]
              </>
            </span>
          </div>
          {bubble.status === 'done' && (
            <BsCheckCircleFill
              size={16}
              style={{ color: theme.accentColor || 'rgb(114, 0, 196)' }}
            />
          )}
        </motion.div>

        <div className={styles.streamingContainer}>
          {bubble.status === 'pending' && bubble.streamingContent && bubble.streamingContent.trim().length > 250 && (
            <div
              className={styles.hierarchyLine}
              style={{ backgroundColor: `${tooltipTextColor}20` }}
            />
          )}

          <AnimatePresence mode="wait">
            {bubble.status === 'pending' && bubble.streamingContent && bubble.streamingContent.trim().length > 250 && (
              <motion.div
                variants={tooltipVariants}
                initial="initial"
                animate="animate"
                exit="exit"
                onHoverStart={() => setIsHovered(true)}
                onHoverEnd={() => setIsHovered(false)}
                className={styles.streamingBubble}
                style={{
                  backgroundColor: tooltipBackgroundColor,
                  border: `1px solid ${
                    theme.semiTransparentAccentColor || 'rgba(114, 0, 196, 0.1)'
                  }`,
                }}
              >
                <motion.div
                  variants={streamingTextVariants}
                  initial="initial"
                  animate="animate"
                  exit="exit"
                  className={styles.streamingContent}
                  style={{ color: tooltipTextColor }}
                >
                  {truncatedContent}
                </motion.div>
                {!isHovered && bubble.streamingContent.length > 100 && (
                  <div
                    className={styles.fadeGradient}
                    style={{
                      background: `linear-gradient(transparent, ${tooltipBackgroundColor})`,
                    }}
                  />
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
