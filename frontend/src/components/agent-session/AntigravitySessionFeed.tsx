import React, { useState, useMemo } from 'react';
import { AgentStreamBlock, UserMessageBlock, NoticeBlock, AssistantTextBlock } from './types';
import { UserChatBubble } from './UserChatBubble';
import { ToolGroup } from './ToolGroup';
import { BashTool } from './BashTool';
import { SearchTool } from './SearchTool';
import { EditTool } from './EditTool';
import { TodoTool } from './TodoTool';
import { PlanTool } from './PlanTool';
import { QuestionTool } from './QuestionTool';
import { ApprovalCard } from './ApprovalCard';
import { MarkdownText } from './MarkdownText';
import { NoticeDivider } from './NoticeDivider';
import { SpiralLoader } from './SpiralLoader';
import { MessageTimestamp } from './MessageTimestamp';
import { RespondToApproval, RespondToQuestion } from '../../../wailsjs/go/main/App';

export interface AntigravitySessionFeedProps {
  blocks: AgentStreamBlock[];
  threadId?: string;
  isWorking?: boolean;
  className?: string;
  onApprovePlan?: (blockId: string) => void;
  onAnswerQuestion?: (blockId: string, answers: string[]) => void;
  onSkipQuestion?: (blockId: string) => void;
  onRespondApproval?: (requestId: string, decision: string) => void;
  onFileClick?: (path: string) => void;
}

interface Turn {
  id: string;
  userBlock?: UserMessageBlock;
  notices: NoticeBlock[];
  workBlocks: AgentStreamBlock[];
  interactiveBlocks: AgentStreamBlock[]; // plans, questions
  textBlocks: AssistantTextBlock[];
  isCurrent: boolean;
  startTime?: number;
}

/**
 * AntigravitySessionFeed Component
 * Implements native Google Antigravity UI kinematics:
 * - While working: Groups tool actions into categorized expandable pills
 *   (e.g. 'Ran 3 commands >', 'Exploring 6 files, 3 searches v') and shows 'Working' status.
 * - When finished: Collapses all operations into a single 'Worked for Xs >' pill,
 *   wipes away intermediate thinking, and cleanly displays the final markdown result.
 */
export const AntigravitySessionFeed: React.FC<AntigravitySessionFeedProps> = ({
  blocks,
  threadId,
  isWorking = false,
  className = '',
  onApprovePlan,
  onAnswerQuestion,
  onSkipQuestion,
  onRespondApproval,
  onFileClick,
}) => {
  // Manual expand/collapse toggles for finished turn pills (keyed by turn.id)
  const [expandedTurns, setExpandedTurns] = useState<Record<string, boolean>>({});

  const toggleTurnExpanded = (turnId: string) => {
    setExpandedTurns((prev) => ({
      ...prev,
      [turnId]: !prev[turnId],
    }));
  };

  // Partition the flat block stream into chronological user turns
  const turns = useMemo(() => {
    const result: Turn[] = [];
    let currentTurn: Turn = {
      id: 'turn-init',
      notices: [],
      workBlocks: [],
      interactiveBlocks: [],
      textBlocks: [],
      isCurrent: false,
    };

    for (const block of blocks) {
      if (block.type === 'user') {
        if (
          currentTurn.userBlock ||
          currentTurn.workBlocks.length > 0 ||
          currentTurn.textBlocks.length > 0 ||
          currentTurn.interactiveBlocks.length > 0 ||
          currentTurn.notices.length > 0
        ) {
          result.push(currentTurn);
        }
        currentTurn = {
          id: block.id || `turn-${Date.now()}-${result.length}`,
          userBlock: block,
          notices: [],
          workBlocks: [],
          interactiveBlocks: [],
          textBlocks: [],
          isCurrent: false,
          startTime: block.timestamp,
        };
      } else if (block.type === 'notice') {
        currentTurn.notices.push(block);
      } else if (block.type === 'text') {
        currentTurn.textBlocks.push(block);
      } else if (block.type === 'tool_plan' || block.type === 'tool_question' || block.type === 'approval_request') {
        currentTurn.interactiveBlocks.push(block);
      } else {
        // tool_group, tool_bash, tool_search, tool_edit, tool_todo, thinking
        currentTurn.workBlocks.push(block);
      }
    }

    if (
      currentTurn.userBlock ||
      currentTurn.workBlocks.length > 0 ||
      currentTurn.textBlocks.length > 0 ||
      currentTurn.interactiveBlocks.length > 0 ||
      currentTurn.notices.length > 0
    ) {
      result.push(currentTurn);
    }

    if (result.length > 0) {
      result[result.length - 1].isCurrent = isWorking;
    }

    return result;
  }, [blocks, isWorking]);

  // Estimates or formats the elapsed duration for a finished turn
  const getTurnDuration = (turn: Turn): number => {
    if (turn.startTime) {
      const elapsed = Math.round((Date.now() - turn.startTime) / 1000);
      if (elapsed > 0 && elapsed < 300) return elapsed;
    }
    // Fallback based on work density: ~3-5 seconds per tool call
    const toolCount = turn.workBlocks.reduce((acc, b) => {
      if (b.type === 'tool_group') return acc + (b.items?.length || 1);
      return acc + 1;
    }, 0);
    return Math.max(3, toolCount * 4);
  };

  const renderWorkBlock = (block: AgentStreamBlock, defaultExpanded = false) => {
    switch (block.type) {
      case 'tool_group':
        return (
          <ToolGroup
            key={block.id}
            title={block.title}
            summary={block.summary}
            items={block.items}
            defaultExpanded={defaultExpanded}
          />
        );
      case 'tool_bash':
        return (
          <BashTool
            key={block.id}
            command={block.command}
            summary={block.summary}
            output={block.output}
            status={block.status}
            exitCode={block.exitCode}
          />
        );
      case 'tool_search':
        return (
          <SearchTool
            key={block.id}
            files={block.files}
            query={block.query}
            summary={block.summary}
            isSearching={block.isSearching}
            onFileClick={onFileClick}
          />
        );
      case 'tool_edit':
        return (
          <EditTool
            key={block.id}
            filePath={block.filePath}
            additions={block.additions}
            deletions={block.deletions}
            diffLines={block.diffLines}
          />
        );
      case 'tool_todo':
        return <TodoTool key={block.id} title={block.title} todos={block.todos} />;
      default:
        return null;
    }
  };

  return (
    <div className={`flex flex-col gap-3.5 ${className}`}>
      {turns.map((turn) => {
        const isTurnActive = turn.isCurrent && isWorking;
        const isExpanded = !!expandedTurns[turn.id];
        const duration = getTurnDuration(turn);
        const hasWork = turn.workBlocks.length > 0;

        return (
          <div key={turn.id} className="flex flex-col gap-2.5">
            {/* User Prompt */}
            {turn.userBlock && (
              <UserChatBubble
                key={turn.userBlock.id}
                message={turn.userBlock.content}
                timestamp={turn.userBlock.timestamp}
                files={turn.userBlock.files}
              />
            )}

            {/* Notices / System messages */}
            {turn.notices.map((n) => (
              <NoticeDivider key={n.id} label={n.label} icon={n.icon} />
            ))}

            {/* In-Progress (Working) State: Show active tool pills and 'Working' spinner */}
            {isTurnActive && hasWork && (
              <div className="flex flex-col gap-2 pl-0.5">
                {turn.workBlocks.map((block, idx) =>
                  renderWorkBlock(block, idx === turn.workBlocks.length - 1),
                )}

                <div className="flex items-center gap-2 pt-1 pl-1">
                  <SpiralLoader size={14} className="text-white/80" />
                  <span className="text-[12px] font-medium font-['Geist'] text-white/70 tracking-tight select-none">
                    Working
                  </span>
                </div>
              </div>
            )}

            {/* Finished State: Collapsed 'Worked for Xs >' Summary Pill */}
            {!isTurnActive && hasWork && (
              <div className="flex flex-col gap-1.5 pl-0.5">
                <button
                  type="button"
                  onClick={() => toggleTurnExpanded(turn.id)}
                  className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-[6px] hover:bg-white/10 active:scale-95 transition-all duration-150 cursor-pointer self-start group text-left"
                >
                  <span className="text-[12px] font-medium font-['Geist'] text-white/60 group-hover:text-white/90 tracking-tight select-none leading-none">
                    Worked for {duration}s
                  </span>
                  <span
                    className={`material-symbols-outlined text-[15px] text-white/40 group-hover:text-white/80 leading-none transition-transform duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] ${
                      isExpanded ? 'rotate-90' : 'rotate-0'
                    }`}
                  >
                    chevron_right
                  </span>
                </button>

                {/* Expandable detailed tool history for the completed turn */}
                {isExpanded && (
                  <div className="flex flex-col gap-1.5 pl-2 pt-1 pb-1 border-l border-white/10 ml-2">
                    {turn.workBlocks.map((block) => renderWorkBlock(block, true))}
                  </div>
                )}
              </div>
            )}

            {/* Interactive Tool Blocks (Plan approvals, questions) */}
            {turn.interactiveBlocks.map((block) => {
              if (block.type === 'tool_plan') {
                return (
                  <PlanTool
                    key={block.id}
                    planFile={block.planFile}
                    title={block.title}
                    summary={block.summary}
                    approved={block.approved}
                    blockId={block.id}
                    onApproveBlock={onApprovePlan}
                  />
                );
              }
              if (block.type === 'tool_question') {
                return (
                  <QuestionTool
                    key={block.id}
                    questionNumber={block.questionNumber}
                    totalQuestions={block.totalQuestions}
                    question={block.question}
                    options={block.options}
                    items={block.items}
                    answered={block.answered}
                    selectedAnswer={block.selectedAnswer}
                    blockId={block.id}
                    onAnswerBlock={async (blockId, answers) => {
                      if (onAnswerQuestion) {
                        onAnswerQuestion(blockId, answers);
                      } else if (threadId) {
                        // Extract requestID: strip the 'question-' prefix to get
                        // the raw ID (e.g. 'ask_question:3' or a UUID)
                        const qId = blockId.replace(/^question-/, '');
                        try {
                          await RespondToQuestion(threadId, qId, answers);
                        } catch (err) {
                          console.error('Failed to respond to question:', err);
                        }
                      }
                    }}
                    onSkipBlock={async (blockId) => {
                      if (onSkipQuestion) {
                        onSkipQuestion(blockId);
                      } else if (threadId) {
                        const qId = blockId.replace(/^question-/, '');
                        try {
                          await RespondToQuestion(threadId, qId, []);
                        } catch (err) {
                          console.error('Failed to skip question:', err);
                        }
                      }
                    }}
                  />
                );
              }
              if (block.type === 'approval_request') {
                return (
                  <ApprovalCard
                    key={block.id}
                    requestID={block.requestID}
                    title={block.title}
                    detail={block.detail}
                    options={block.options}
                    status={block.status}
                    decision={block.decision}
                    onRespond={async (decision) => {
                      if (onRespondApproval) {
                        onRespondApproval(block.requestID, decision);
                      } else if (threadId) {
                        try {
                          await RespondToApproval(threadId, block.requestID, decision);
                        } catch (err) {
                          console.error('Failed to respond to approval:', err);
                        }
                      }
                    }}
                  />
                );
              }
              return null;
            })}

            {/* Clean Final Text Response */}
            {turn.textBlocks.map((block) => (
              <div
                key={block.id}
                className="text-[12px] font-medium font-['Geist'] text-white/90 leading-relaxed pl-0.5 select-text"
              >
                <MarkdownText content={block.content} />
                {block.isStreaming && (
                  <span className="inline-block w-1.5 h-3 bg-white/70 ml-1 animate-pulse align-middle" />
                )}
                {!block.isStreaming && (
                  <MessageTimestamp timestamp={block.timestamp} content={block.content} />
                )}
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
};

export default AntigravitySessionFeed;
