import React, { useEffect } from 'react';

// Reusable Popup Component
export function PopupFrame({ isOpen, onClose, autoCloseTimer, children }) {
  
  // 1. Escape key listener
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown); // Cleanup
  }, [isOpen, onClose]);

  // 2. Automatic timer countdown listener (Optional)
  useEffect(() => {
    if (!isOpen || !autoCloseTimer) return;

    const timer = setTimeout(() => {
      onClose();
    }, autoCloseTimer);

    return () => clearTimeout(timer); // Cleanup if closed early manually
  }, [isOpen, autoCloseTimer, onClose]);

  if (!isOpen) return null;

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.popupBox} onClick={(e) => e.stopPropagation()}>
        <button style={styles.closeButton} onClick={onClose}>
          &times;
        </button>
        <div style={styles.content}>
          {children}
        </div>
      </div>
    </div>
  );
}

// Inline Styles
const styles = {
  appContainer: { fontFamily: 'sans-serif', textAlign: 'center', marginTop: '50px' },
  openButton: { padding: '10px 20px', fontSize: '16px', cursor: 'pointer', backgroundColor: '#007bff', color: '#fff', border: 'none', borderRadius: '4px' },
  overlay: { position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0, 0, 0, 0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 },
  popupBox: { position: 'relative', backgroundColor: '#1d2732', border: '1px solid #485563', padding: '30px', borderRadius: '8px', maxWidth: '500px', width: '90%', boxShadow: '0 4px 6px rgba(0, 0, 0, 0.3)', textAlign: 'center', color: '#fff' },
  closeButton: { position: 'absolute', top: '10px', right: '15px', background: 'none', border: 'none', fontSize: '24px', cursor: 'pointer', color: '#fff' },
  content: { marginTop: '10px' }
};
