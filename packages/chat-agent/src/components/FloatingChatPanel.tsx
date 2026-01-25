"use client";

import { X, Maximize2, Minimize2, Bot } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { useRef } from "react";
import { useChat } from "./chat-context.js";
import ChatInterface, { ChatInterfaceRef } from "./ChatInterface.js";
import ChatMenuDropdown from "./ChatMenuDropdown.js";
import { DefaultImage, DefaultLink, ImageComponent, LinkComponent } from "../types/components.js";
import { cn } from "../lib/utils.js";

interface FloatingChatPanelProps {
  isOpen: boolean;
  onClose: () => void;
  aiIcon?: string;
  agentName?: string;
  generateHref: (props: { type: string; value: { id: number; slug?: string | null } }) => string;
  ImageComponent?: ImageComponent;
  LinkComponent?: LinkComponent;
}

const FloatingChatPanel = ({
  isOpen,
  onClose,
  aiIcon,
  agentName = "Asistente",
  generateHref,
  ImageComponent: Image = DefaultImage,
  LinkComponent: Link = DefaultLink
}: FloatingChatPanelProps) => {
  const { isMaximized, setMaximized } = useChat();
  const chatInterfaceRef = useRef<ChatInterfaceRef>(null);

  const handleNewConversation = () => {
    chatInterfaceRef.current?.handleNewConversation();
  };

  return (
    <>
      {/* Backdrop cuando esta maximizado - solo en desktop */}
      <AnimatePresence>
        {isMaximized && isOpen && (
          <motion.div
            className="fixed inset-0 bg-black/20 backdrop-blur-sm z-40 hidden lg:block"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={() => setMaximized(false)}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            className="fixed bg-background shadow-2xl flex flex-col z-50 lg:border lg:border-border overflow-hidden"
            style={{ borderWidth: "0.5px" }}
            initial={{
              x: "-100vw",
              left: 0,
              top: 0,
              bottom: 0,
              width: "100vw",
              borderRadius: "0px",
            }}
            animate={() => {
              if (isMaximized) {
                return {
                  x: 0,
                  left: 0,
                  top: 0,
                  right: 0,
                  bottom: 0,
                  width: "100vw",
                  height: "100vh",
                  borderRadius: "0px",
                }
              }
              // Calculate mobile/tablet state once
              const isMobileOrTablet = typeof window !== "undefined" && window.innerWidth < 1024
              return {
                x: 0,
                // En movil/tablet: fullscreen, en desktop: panel lateral
                left: isMobileOrTablet ? 0 : "1rem",
                top: isMobileOrTablet ? 0 : "5rem",
                right: "auto",
                bottom: isMobileOrTablet ? 0 : "1rem",
                // Movil/Tablet: 100vw (fullscreen), Desktop: 33.333333%
                width: isMobileOrTablet ? "100vw" : "33.333333%",
                height: isMobileOrTablet ? "100vh" : "auto",
                borderRadius: isMobileOrTablet ? "0px" : "0.75rem",
              }
            }}
            exit={{
              x: "-100vw",
              transition: {
                type: "spring",
                damping: 20,
                stiffness: 200,
              },
            }}
            transition={{
              type: "spring",
              damping: 25,
              stiffness: 250,
            }}
          >
            {/* Header with gradient */}
            <div className="flex justify-between items-center p-4 border-b border-border flex-shrink-0 bg-gradient-to-r from-background via-muted/30 to-background">
              <div className="flex items-center gap-3">
                {/* Avatar with breathing effect and status indicator */}
                <div className="relative">
                  <motion.div
                    className={cn(
                      "w-10 h-10 rounded-full p-0.5 flex-shrink-0 bg-gradient-to-br from-primary via-primary/80 to-primary/60 animate-pulse-glow",
                      !aiIcon && "flex items-center justify-center"
                    )}
                  >
                    {aiIcon ? (
                      <div className="w-full h-full rounded-full overflow-hidden">
                        <Image
                          src={aiIcon}
                          alt={agentName}
                          className="w-full h-full object-cover"
                          width={40}
                          height={40}
                        />
                      </div>
                    ) : (
                      <div className="w-full h-full rounded-full overflow-hidden bg-primary flex items-center justify-center">
                        <Bot className="w-6 h-6 text-primary-foreground" />
                      </div>
                    )}
                  </motion.div>
                  {/* Status indicator - AI available */}
                  <motion.div
                    className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full bg-chat-status-online border-2 border-background"
                    animate={{
                      scale: [1, 1.2, 1],
                      opacity: [1, 0.7, 1],
                    }}
                    transition={{
                      duration: 2,
                      repeat: Infinity,
                      ease: "easeInOut",
                    }}
                  />
                </div>
                <div className="flex flex-col">
                  <ChatMenuDropdown
                    title={agentName}
                    onNewConversation={handleNewConversation}
                  />
                  <span className="text-xs text-muted-foreground">
                    Disponible para ayudarte
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-1">
                {/* Boton maximizar/minimizar - solo visible en desktop (>=1024px) */}
                <motion.button
                  onClick={() => setMaximized(!isMaximized)}
                  className="hidden lg:flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                  aria-label={isMaximized ? "Minimizar" : "Maximizar"}
                  whileHover={{ scale: 1.1 }}
                  whileTap={{ scale: 0.95 }}
                >
                  {isMaximized ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
                </motion.button>
                <motion.button
                  onClick={onClose}
                  className="h-9 w-9 flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                  aria-label="Cerrar chat"
                  whileHover={{ scale: 1.1 }}
                  whileTap={{ scale: 0.95 }}
                >
                  <X className="w-5 h-5" />
                </motion.button>
              </div>
            </div>

            {/* Chat Content */}
            <div className="flex-1 overflow-hidden">
              <ChatInterface ref={chatInterfaceRef} generateHref={generateHref} LinkComponent={Link} />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};

export default FloatingChatPanel;
