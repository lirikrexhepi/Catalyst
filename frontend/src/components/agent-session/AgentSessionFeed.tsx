import React from 'react';
import { AgentStreamBlock } from './types';
import { UserChatBubble } from './UserChatBubble';
import { ThinkingBlock } from './ThinkingBlock';
import { BashTool } from './BashTool';
import { SearchTool } from './SearchTool';
import { ToolGroup } from './ToolGroup';
import { EditTool } from './EditTool';
import { TodoTool } from './TodoTool';
import { PlanTool } from './PlanTool';
import { QuestionTool } from './QuestionTool';
import { ApprovalCard } from './ApprovalCard';
import { MarkdownText } from './MarkdownText';
import { NoticeDivider } from './NoticeDivider';
import { InlinePlanCard } from '../orchestrator/InlinePlanCard';
import { extractPlanFromText } from '../orchestrator/extractPlan';
import { MessageTimestamp } from './MessageTimestamp';
import { RespondToApproval, RespondToQuestion } from '../../../wailsjs/go/main/App';

export interface AgentSessionFeedProps {
  blocks: AgentStreamBlock[];
  threadId?: string;
  className?: string;
  onApprovePlan?: (blockId: string) => void;
  onAnswerQuestion?: (blockId: string, answers: string[]) => void;
  onSkipQuestion?: (blockId: string) => void;
  onRespondApproval?: (requestId: string, decision: string) => void;
  onFileClick?: (path: string) => void;
  canUseWorktree?: boolean;
  isActive?: boolean;
  /** Plan keys The Orchestrator already launched backend-side (status, not confirm). */
  launchedKeys?: string[];
  onConfirmPlan?: (
    tasks: { title: string; prompt: string; cwd?: string }[],
    useWorktree: boolean,
    modelIds: string[],
  ) => void;
  onDismissPlan?: () => void;
}

/**
 * AgentSessionFeed Component
 * Dynamic dispatcher that renders a stream of CLI / AI SDK events into their respective glass UI components.
 */
const AgentSessionFeedImpl: React.FC<AgentSessionFeedProps> = ({
  blocks,
  threadId,
  className = '',
  onApprovePlan,
  onAnswerQuestion,
  onSkipQuestion,
  onRespondApproval,
  onFileClick,
  canUseWorktree,
  isActive = true,
  launchedKeys,
  onConfirmPlan,
  onDismissPlan,
}) => {
  const latestPlanBlockId = React.useMemo(() => {
    for (let i = blocks.length - 1; i >= 0; i--) {
      const b = blocks[i];
      if (b.type === 'text' && extractPlanFromText(b.content)) {
        return b.id;
      }
    }
    return null;
  }, [blocks]);

  // One assistant reply can arrive as several text blocks split by tool calls.
  // The date/copy row belongs only under the latest one so it reads once at
  // the bottom instead of repeating after every segment.
  const lastTextIndex = React.useMemo(() => {
    for (let i = blocks.length - 1; i >= 0; i--) {
      if (blocks[i].type === 'text') return i;
    }
    return -1;
  }, [blocks]);

  return (
    <div className={`flex flex-col gap-3.5 ${className}`}>
      {blocks.map((block, index) => {
        const isLatestText = index === lastTextIndex;
        switch (block.type) {
          case 'user':
            return (
              <UserChatBubble
                key={block.id}
                message={block.content}
                timestamp={block.timestamp}
                files={block.files}
              />
            );

          case 'notice':
            return <NoticeDivider key={block.id} label={block.label} icon={block.icon} />;

          case 'text': {
            const plan = extractPlanFromText(block.content);
            if (plan) {
              // The Orchestrator backend launched this plan itself: show prose
              // plus launched status, not a confirm gate. Unlaunched plans keep
              // the card as an override (different models / worktree choice).
              const launched = (launchedKeys ?? []).includes(
                plan.tasks.map((task) => task.title).join('\n'),
              );
              if (launched) {
                const hasContent = Boolean(plan.proseBefore || plan.proseAfter);
                if (!hasContent && !block.isStreaming) {
                  return (
                    <div key={block.id} className="flex flex-col gap-1.5">
                      <InlinePlanCard
                        tasks={plan.tasks}
                        canUseWorktree={canUseWorktree}
                        isLatest={block.id === latestPlanBlockId}
                        isActive={isActive}
                        isStreaming={block.isStreaming}
                        isDispatched
                        onConfirm={() => undefined}
                        onDismiss={onDismissPlan}
                      />
                      {isLatestText && <MessageTimestamp timestamp={block.timestamp} />}
                    </div>
                  );
                }
                return (
                  <div
                    key={block.id}
                    className="text-[12.5px] font-normal font-['Geist'] text-current leading-relaxed pl-0.5 select-text"
                  >
                    {plan.proseBefore && <MarkdownText content={plan.proseBefore} />}
                    <InlinePlanCard
                      tasks={plan.tasks}
                      canUseWorktree={canUseWorktree}
                      isLatest={block.id === latestPlanBlockId}
                      isActive={isActive}
                      isStreaming={block.isStreaming}
                      isDispatched
                      onConfirm={() => undefined}
                      onDismiss={onDismissPlan}
                    />
                    {plan.proseAfter && <MarkdownText content={plan.proseAfter} />}
                    {block.isStreaming && (
                      <span className="inline-block w-1.5 h-3 bg-current ml-1 animate-pulse align-middle opacity-70" />
                    )}
                    {!block.isStreaming && isLatestText && (
                      <MessageTimestamp timestamp={block.timestamp} content={block.content} />
                    )}
                  </div>
                );
              }

              return (
                <div
                  key={block.id}
                  className="text-[12.5px] font-normal font-['Geist'] text-current leading-relaxed pl-0.5 select-text"
                >
                  {plan.proseBefore && <MarkdownText content={plan.proseBefore} />}
                  <InlinePlanCard
                    tasks={plan.tasks}
                    canUseWorktree={canUseWorktree}
                    isLatest={block.id === latestPlanBlockId}
                    isActive={isActive}
                    isStreaming={block.isStreaming}
                    onConfirm={(useWorktree, modelIds) =>
                      onConfirmPlan?.(plan.tasks, useWorktree, modelIds)
                    }
                    onDismiss={onDismissPlan}
                  />
                  {plan.proseAfter && <MarkdownText content={plan.proseAfter} />}
                  {block.isStreaming && (
                    <span className="inline-block w-1.5 h-3 bg-current ml-1 animate-pulse align-middle opacity-70" />
                  )}
                  {!block.isStreaming && isLatestText && (
                    <MessageTimestamp timestamp={block.timestamp} content={block.content} />
                  )}
                </div>
              );
            }

            return (
              <div
                key={block.id}
                className="text-[12.5px] font-normal font-['Geist'] text-current leading-relaxed pl-0.5 select-text"
              >
                <MarkdownText content={block.content} />
                {block.isStreaming && (
                  <span className="inline-block w-1.5 h-3 bg-current ml-1 animate-pulse align-middle opacity-70" />
                )}
                {!block.isStreaming && isLatestText && (
                  <MessageTimestamp timestamp={block.timestamp} content={block.content} />
                )}
              </div>
            );
          }

          case 'thinking':
            return (
              <ThinkingBlock
                key={block.id}
                isThinking={block.isThinking}
                thoughtText={block.thoughtText}
                durationSeconds={block.durationSeconds}
              />
            );

          case 'tool_group':
            return (
              <ToolGroup
                key={block.id}
                title={block.title}
                summary={block.summary}
                items={block.items}
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
            return (
              <TodoTool
                key={block.id}
                title={block.title}
                todos={block.todos}
              />
            );

          case 'tool_plan':
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

          case 'tool_question':
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

          case 'approval_request':
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

          default:
            return null;
        }
      })}
    </div>
  );
};

export const AgentSessionFeed = React.memo(AgentSessionFeedImpl);
AgentSessionFeed.displayName = 'AgentSessionFeed';

export default AgentSessionFeed;
