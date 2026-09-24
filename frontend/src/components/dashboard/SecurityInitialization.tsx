import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface SecurityInitializationProps {
  onComplete: () => void;
}

const initSteps = [
  { label: 'AUTHENTICATED', delay: 0 },
  { label: 'ESTABLISHING SECURE SESSION...', delay: 80 },
  { label: 'VERIFYING WORKSPACE...', delay: 160 },
  { label: 'LOADING INFRASTRUCTURE...', delay: 240 },
  { label: 'SYSTEM READY', delay: 320 },
];

export const SecurityInitialization: React.FC<SecurityInitializationProps> = ({ onComplete }) => {
  const [currentStep, setCurrentStep] = useState(0);
  const [isComplete, setIsComplete] = useState(false);

  useEffect(() => {
    const handleKeyDown = () => {
      setIsComplete(true);
      onComplete();
    };
    window.addEventListener('keydown', handleKeyDown);

    const timers = initSteps.map((step, index) => 
      setTimeout(() => {
        setCurrentStep(index);
        if (index === initSteps.length - 1) {
          setTimeout(() => {
            setIsComplete(true);
            setTimeout(onComplete, 150);
          }, 120);
        }
      }, step.delay)
    );

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      timers.forEach(timer => clearTimeout(timer));
    };
  }, [onComplete]);

  return (
    <AnimatePresence>
      {!isComplete && (
        <motion.div
          initial={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.4 }}
          onClick={() => {
            setIsComplete(true);
            onComplete();
          }}
          style={{
            position: 'fixed',
            inset: 0,
            background: '#000',
            zIndex: 9999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            overflow: 'hidden',
            cursor: 'pointer',
          }}
        >
          {/* Subtle Grid Background */}
          <div style={{
            position: 'absolute',
            inset: 0,
            backgroundImage: `
              linear-gradient(rgba(254,110,68,0.02) 1px, transparent 1px),
              linear-gradient(90deg, rgba(254,110,68,0.02) 1px, transparent 1px)
            `,
            backgroundSize: '60px 60px',
            opacity: 0.3,
          }} />

          {/* Orange Glow */}
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 0.4, scale: 1 }}
            transition={{ duration: 0.8 }}
            style={{
              position: 'absolute',
              width: '600px',
              height: '600px',
              background: 'radial-gradient(circle, rgba(254,110,68,0.15) 0%, transparent 70%)',
              pointerEvents: 'none',
            }}
          />

          {/* Main Content */}
          <div style={{
            position: 'relative',
            zIndex: 10,
            textAlign: 'center',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '2rem',
          }}>
            {/* Shield Icon with Pulse */}
            <motion.div
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ duration: 0.4 }}
              style={{ position: 'relative' }}
            >
              {/* Pulse Ring */}
              <motion.div
                animate={{
                  scale: [1, 1.3, 1.3, 1],
                  opacity: [0.5, 0, 0, 0.5],
                }}
                transition={{
                  duration: 2,
                  repeat: Number.POSITIVE_INFINITY,
                  ease: 'easeOut',
                }}
                style={{
                  position: 'absolute',
                  inset: '-20px',
                  border: '2px solid #FE6E44',
                  borderRadius: '50%',
                }}
              />
              
              <svg width="80" height="80" viewBox="0 0 24 24" fill="none" stroke="#FE6E44" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
                <motion.path
                  initial={{ pathLength: 0 }}
                  animate={{ pathLength: 1 }}
                  transition={{ duration: 0.8, delay: 0.2 }}
                  d="M9 12l2 2 4-4"
                  strokeWidth="2"
                />
              </svg>
            </motion.div>

            {/* Brand */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.2 }}
            >
              <div style={{
                fontFamily: 'var(--font-display)',
                fontSize: '1.5rem',
                fontWeight: 900,
                letterSpacing: '0.15em',
                textTransform: 'uppercase',
                color: '#fff',
                marginBottom: '0.5rem',
              }}>
                MCP·A2A
              </div>
              <div style={{
                fontFamily: 'var(--font-body)',
                fontSize: '0.7rem',
                letterSpacing: '0.18em',
                textTransform: 'uppercase',
                color: '#FE6E44',
                fontWeight: 600,
              }}>
                SECURITY COMMAND CENTER
              </div>
            </motion.div>

            {/* Initialization Steps */}
            <div style={{
              minHeight: '120px',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '0.75rem',
            }}>
              <AnimatePresence>
                {initSteps.slice(0, currentStep + 1).map((step, index) => (
                  <motion.div
                    key={index}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: index === currentStep ? 1 : 0.3, x: 0 }}
                    exit={{ opacity: 0, x: 20 }}
                    transition={{ duration: 0.3 }}
                    style={{
                      fontFamily: 'var(--font-body)',
                      fontSize: index === currentStep ? '0.85rem' : '0.75rem',
                      letterSpacing: '0.12em',
                      color: index === currentStep ? (step.label === 'SYSTEM READY' ? '#7CFF4F' : '#FE6E44') : 'rgba(255,255,255,0.4)',
                      fontWeight: index === currentStep ? 600 : 400,
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.75rem',
                      transition: 'all 0.3s',
                    }}
                  >
                    {index === currentStep && step.label !== 'SYSTEM READY' && (
                      <motion.div
                        animate={{ rotate: 360 }}
                        transition={{ duration: 1, repeat: Number.POSITIVE_INFINITY, ease: 'linear' }}
                        style={{
                          width: '12px',
                          height: '12px',
                          border: '2px solid #FE6E44',
                          borderTopColor: 'transparent',
                          borderRadius: '50%',
                        }}
                      />
                    )}
                    {index === currentStep && step.label === 'SYSTEM READY' && (
                      <motion.div
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        transition={{ duration: 0.3, type: 'spring' }}
                        style={{
                          width: '12px',
                          height: '12px',
                          background: '#7CFF4F',
                          borderRadius: '50%',
                          boxShadow: '0 0 12px #7CFF4F',
                        }}
                      />
                    )}
                    {index < currentStep && (
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.4)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="20 6 9 17 4 12"/>
                      </svg>
                    )}
                    <span>{step.label}</span>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>

            {/* Progress Bar */}
            <div style={{
              width: '300px',
              height: '2px',
              background: 'rgba(255,255,255,0.05)',
              borderRadius: '1px',
              overflow: 'hidden',
              position: 'relative',
            }}>
              <motion.div
                initial={{ width: '0%' }}
                animate={{ width: `${((currentStep + 1) / initSteps.length) * 100}%` }}
                transition={{ duration: 0.3 }}
                style={{
                  height: '100%',
                  background: currentStep === initSteps.length - 1 ? '#7CFF4F' : '#FE6E44',
                  boxShadow: currentStep === initSteps.length - 1 ? '0 0 8px #7CFF4F' : '0 0 8px #FE6E44',
                }}
              />
            </div>

            {/* Technical Details */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.6 }}
              style={{
                fontFamily: 'var(--font-body)',
                fontSize: '0.65rem',
                letterSpacing: '0.1em',
                textTransform: 'uppercase',
                color: 'rgba(255,255,255,0.25)',
                marginTop: '1rem',
              }}
            >
              TLS 1.3 • Ed25519 • gVisor Enclave Active
            </motion.div>
          </div>

          {/* Bottom Hint */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.8 }}
            style={{
              position: 'absolute',
              bottom: '2rem',
              left: '50%',
              transform: 'translateX(-50%)',
              fontFamily: 'var(--font-body)',
              fontSize: '0.65rem',
              letterSpacing: '0.1em',
              color: 'rgba(255,255,255,0.2)',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
            }}
          >
            <span>Press</span>
            <kbd style={{
              padding: '0.2rem 0.5rem',
              background: 'rgba(255,255,255,0.05)',
              border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: '3px',
              fontFamily: 'var(--font-body)',
              fontSize: '0.65rem',
            }}>ESC</kbd>
            <span>to skip</span>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
