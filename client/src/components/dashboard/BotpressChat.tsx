import React, { useEffect, useRef, useState } from 'react';

interface BotpressChatProps {
  clientId?: string;
  hideWidget?: boolean;
  className?: string;
  customOpenIcon?: React.ReactNode;
}

/**
 * BotpressChat Component
 * 
 * This component integrates a Botpress chatbot into a React application.
 * 
 * @param {string} clientId - Optional override for the default client ID
 * @param {boolean} hideWidget - If true, hides the default floating widget button
 * @param {string} className - Optional CSS class for styling
 * @param {React.ReactNode} customOpenIcon - Optional custom button/element to open the chat
 */
const BotpressChat: React.FC<BotpressChatProps> = ({
  clientId = 'e762d75a-acbf-4640-be29-97f3cf49309a', // Default client ID
  hideWidget = false,
  className = '',
  customOpenIcon
}) => {
  const [botpressLoaded, setBotpressLoaded] = useState(false);
  const botpressInitialized = useRef(false);

  // Initialize the Botpress webchat
  useEffect(() => {
    // Only run this effect once
    if (botpressInitialized.current) return;
    botpressInitialized.current = true;

    // Function to load the necessary scripts
    const loadBotpressScripts = async () => {
      try {
        // Load the inject script
        const injectScript = document.createElement('script');
        injectScript.src = 'https://cdn.botpress.cloud/webchat/v2.4/inject.js';
        injectScript.async = true;
        injectScript.onload = () => {
          // Load the configuration script after inject is loaded
          const configScript = document.createElement('script');
          configScript.src = 'https://files.bpcontent.cloud/2025/04/29/18/20250429180310-G3S1LCF0.js';
          configScript.async = true;
          configScript.onload = () => {
            // Set loaded state once both scripts are loaded
            setBotpressLoaded(true);
          };
          document.body.appendChild(configScript);
        };
        document.body.appendChild(injectScript);
      } catch (error) {
        console.error('Failed to load Botpress scripts:', error);
      }
    };

    loadBotpressScripts();

    // Cleanup function
    return () => {
      // Remove Botpress elements if needed when component unmounts
      const botpressIframe = document.getElementById('bp-web-widget-container');
      if (botpressIframe) {
        botpressIframe.remove();
      }
    };
  }, []);

  // Initialize or configure the webchat once scripts are loaded
  useEffect(() => {
    if (!botpressLoaded || !window.botpressWebChat) return;

    try {
      // Initialize the webchat with customized options
      window.botpressWebChat.init({
        clientId: clientId,
        hideWidget: hideWidget,
        messagingUrl: 'https://messaging.botpress.cloud',
        hostUrl: 'https://cdn.botpress.cloud/webchat/v2.4',
        composerPlaceholder: 'Chat with our bot',
        botConversationDescription: 'Your AI Assistant',
        botName: 'AI Assistant',
        stylesheet: 'https://files.bpcontent.cloud/2025/04/29/18/20250429180310-K9FBEB5E.json',
        // Custom parameters can be added as needed
        useSessionStorage: true,
        enableConversationDeletion: true,
      });
    } catch (error) {
      console.error('Failed to initialize Botpress webchat:', error);
    }
  }, [botpressLoaded, clientId, hideWidget]);

  // Function to open the chat programmatically
  const openChat = () => {
    if (window.botpressWebChat) {
      window.botpressWebChat.open();
    }
  };

  return (
    <div className={className}>
      {customOpenIcon && (
        <div onClick={openChat} style={{ cursor: 'pointer' }}>
          {customOpenIcon}
        </div>
      )}
    </div>
  );
};

// Add type definitions for window object
declare global {
  interface Window {
    botpressWebChat: {
      init: (config: any) => void;
      open: () => void;
      close: () => void;
      toggle: () => void;
      sendEvent: (event: any) => void;
    };
  }
}

export default BotpressChat;