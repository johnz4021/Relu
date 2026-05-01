import { useState } from 'react';
import LeetCodeSolver from './LeetCodeSolver';
import ConversationHistory from './ConversationHistory';
import ConversationTranscript from './ConversationTranscript';
import HelpCenter from './HelpCenter';
import { posthog, POSTHOG_KEY } from '../lib/posthog';

const track = (event, props) => POSTHOG_KEY && posthog.capture(event, props);

export default function LandingTabs({ onSelect, disabled, send, conversations, lcSessions, loadedConversation, viewingHistory, onClearHistory, processMessage, onResumeConversation, lcParsed, onMasterLcSession }) {
  const [activeTab, setActiveTab] = useState('solver');

  const handleViewTranscript = (conversationId) => {
    send({ type: 'load_conversation', conversationId });
  };

  const handleResume = (conversationId) => {
    if (onResumeConversation) {
      onResumeConversation(conversationId);
    } else {
      send({ type: 'resume_conversation', conversationId });
    }
  };

  const tabs = [
    { id: 'solver', label: 'Practice' },
    { id: 'history', label: 'History' },
    { id: 'help', label: 'Help Center' },
  ];

  return (
    <div className="flex flex-col h-full bg-surface-0">
      <div className="flex justify-center gap-2 pt-6 pb-2 border-b border-border">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => {
              track('tab_switched', { tab: tab.id });
              setActiveTab(tab.id);
              if (tab.id !== 'history' && viewingHistory) {
                onClearHistory?.();
              }
            }}
            className={`px-5 py-2 text-sm font-medium font-body rounded-full transition-colors ${
              activeTab === tab.id
                ? 'bg-accent-muted text-accent'
                : 'text-text-tertiary hover:text-text-secondary'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <div className="flex-1 overflow-auto">
        {activeTab === 'solver' ? (
          <LeetCodeSolver onSelect={onSelect} disabled={disabled} lcParsed={lcParsed} />
        ) : activeTab === 'help' ? (
          <HelpCenter />
        ) : viewingHistory && loadedConversation ? (
          <ConversationTranscript
            messages={loadedConversation}
            onBack={() => onClearHistory?.()}
          />
        ) : (
          <ConversationHistory
            conversations={conversations}
            lcSessions={lcSessions}
            send={send}
            onViewTranscript={handleViewTranscript}
            onResume={handleResume}
            onMasterLcSession={onMasterLcSession}
          />
        )}
      </div>
    </div>
  );
}
