import MathText from './MathText';

const TYPE_STYLES = {
  narration: 'text-text-secondary',
  guided_question: 'text-text-secondary',
  guided_answer: 'text-accent',
  student_message: 'text-accent',
  conversational_reply: 'text-text-primary',
};

export default function ConversationTranscript({ messages, onBack }) {
  return (
    <div className="max-w-2xl mx-auto px-4 py-6 font-body">
      <button
        onClick={onBack}
        className="mb-4 text-sm text-text-tertiary hover:text-text-primary transition-colors"
      >
        &larr; Back to History
      </button>
      <div className="space-y-3">
        {messages.map((msg) => {
          const style = TYPE_STYLES[msg.type] || 'text-text-secondary';
          const isStudent = msg.role === 'student';
          return (
            <div
              key={msg.id}
              className={`text-sm ${isStudent ? 'pl-4 border-l-2 border-accent' : ''}`}
            >
              <span className="text-xs text-text-tertiary mr-2">
                {isStudent ? 'You' : 'Argmax'}
              </span>
              <span className={style}>
                <MathText>{msg.content}</MathText>
              </span>
            </div>
          );
        })}
        {messages.length === 0 && (
          <p className="text-text-tertiary text-sm text-center">No messages in this session.</p>
        )}
      </div>
    </div>
  );
}
