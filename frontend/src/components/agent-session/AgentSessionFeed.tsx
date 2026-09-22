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

/** extractPlanFromText parses every text block on every render; cache it. */
const planCache = new Map<string, ReturnType<typeof extractPlanFromText>>();
function planOf(content: string) {
  if (planCache.has(content)) return planCache.get(content)!;
  const plan = extractPlanFromText(content);
  if (planCache.size > 300) planCache.clear();
  planCache.set(content, plan);
  return plan;
}

type Handlers = Omit<AgentSessionFeedProps, 'blocks' | 'className' | 'isActive' | 'launchedKeys' | 'canUseWorktree'>;

interface FeedBlockProps {
  block: AgentStreamBlock;
  isLatestText: boolean;
  isLatestPlan: boolean;
  launched: boolean;
  canUseWorktree?: boolean;
  isActive: boolean;
  handlers: React.MutableRefObject<Handlers>;
}

/**
 * One feed entry. Memoised on the block object itself, so a streaming token
 * re-renders only the block it lands in, not the whole transcript. Callbacks
 * are read through a ref so their identity never defeats the memo.
 */
const FeedBlock = React.memo(function FeedBlock({
  block,
  isLatestText,
  isLatestPlan,
  launched,
  canUseWorktree,
  isActive,
  handlers,
}: FeedBlockProps) {
  const h = handlers.current;
  switch (block.type) {
    case 'user':
      return <UserChatBubble message={block.content} timestamp={block.timestamp} files={block.files} />;

    case 'notice':
      return <NoticeDivider label={block.label} icon={block.icon} />;

    case 'text': {
      const tone = block.variant === 'error' ? 'text-rose-300' : 'text-current';
      const plan = block.variant ? null : planOf(block.content);
      const cursor = block.isStreaming && (
        <span className="inline-block w-1.5 h-3 bg-current ml-1 animate-pulse align-middle opacity-70" />
      );
      const stamp = !block.isStreaming && isLatestText && (
        <MessageTimestamp timestamp={block.timestamp} content={block.content} />
      );
      if (plan) {
        if (launched && !(plan.proseBefore || plan.proseAfter) && !block.isStreaming) {
          return (
            <div className="flex flex-col gap-1.5">
              <InlinePlanCard
                tasks={plan.tasks}
                canUseWorktree={canUseWorktree}
                isLatest={isLatestPlan}
                isActive={isActive}
                isStreaming={block.isStreaming}
                isDispatched
                onConfirm={() => undefined}
                onDismiss={() => handlers.current.onDismissPlan?.()}
              />
              {isLatestText && <MessageTimestamp timestamp={block.timestamp} />}
            </div>
          );
        }
        return (
          <div className={`text-[12.5px] font-normal font-['Geist'] ${tone} leading-relaxed pl-0.5 select-text`}>
            {plan.proseBefore && <MarkdownText content={plan.proseBefore} />}
            <InlinePlanCard
              tasks={plan.tasks}
              canUseWorktree={canUseWorktree}
              isLatest={isLatestPlan}
              isActive={isActive}
              isStreaming={block.isStreaming}
              isDispatched={launched}
              onConfirm={
                launched
                  ? () => undefined
                  : (useWorktree, modelIds) => handlers.current.onConfirmPlan?.(plan.tasks, useWorktree, modelIds)
              }
              onDismiss={() => handlers.current.onDismissPlan?.()}
            />
            {plan.proseAfter && <MarkdownText content={plan.proseAfter} />}
            {cursor}
            {stamp}
          </div>
        );
      }
      return (
        <div className={`text-[12.5px] font-normal font-['Geist'] ${tone} leading-relaxed pl-0.5 select-text`}>
          <MarkdownText content={block.content} />
          {cursor}
          {stamp}
        </div>
      );
    }

    case 'thinking':
      return (
        <ThinkingBlock
          isThinking={block.isThinking}
          thoughtText={block.thoughtText}
          durationSeconds={block.durationSeconds}
        />
      );

    case 'tool_group':
      return <ToolGroup title={block.title} summary={block.summary} items={block.items} />;

    case 'tool_bash':
      return (
        <BashTool
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
          files={block.files}
          query={block.query}
          summary={block.summary}
          isSearching={block.isSearching}
          onFileClick={(path) => handlers.current.onFileClick?.(path)}
        />
      );

    case 'tool_edit':
      return (
        <EditTool
          filePath={block.filePath}
          additions={block.additions}
          deletions={block.deletions}
          diffLines={block.diffLines}
          toolName={block.toolName}
          status={block.status}
          defaultExpanded={Boolean(block.diffLines?.length) && (block.diffLines?.length ?? 0) <= 40}
        />
      );

    case 'tool_todo':
      return <TodoTool title={block.title} todos={block.todos} />;

    case 'tool_plan':
      return (
        <PlanTool
          planFile={block.planFile}
          title={block.title}
          summary={block.summary}
          approved={block.approved}
          blockId={block.id}
          onApproveBlock={(id) => handlers.current.onApprovePlan?.(id)}
        />
      );

    case 'tool_question':
      return (
        <QuestionTool
          questionNumber={block.questionNumber}
          totalQuestions={block.totalQuestions}
          question={block.question}
          options={block.options}
          items={block.items}
          answered={block.answered}
          selectedAnswer={block.selectedAnswer}
          blockId={block.id}
          onAnswerBlock={async (blockId, answers) => {
            const { onAnswerQuestion, threadId } = handlers.current;
            if (onAnswerQuestion) {
              onAnswerQuestion(blockId, answers);
            } else if (threadId) {
              try {
                await RespondToQuestion(threadId, blockId.replace(/^question-/, ''), answers);
              } catch (err) {
                console.error('Failed to respond to question:', err);
              }
            }
          }}
          onSkipBlock={async (blockId) => {
            const { onSkipQuestion, threadId } = handlers.current;
            if (onSkipQuestion) {
              onSkipQuestion(blockId);
            } else if (threadId) {
              try {
                await RespondToQuestion(threadId, blockId.replace(/^question-/, ''), []);
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
          requestID={block.requestID}
          title={block.title}
          detail={block.detail}
          options={block.options}
          status={block.status}
          decision={block.decision}
          onRespond={async (decision) => {
            const { onRespondApproval, threadId } = handlers.current;
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
});

/**
 * AgentSessionFeed Component
 * Dynamic dispatcher that renders a stream of CLI / AI SDK events into their respective glass UI components.
 */
const AgentSessionFeedImpl: React.FC<AgentSessionFeedProps> = ({
  blocks,
  className = '',
  canUseWorktree,
  isActive = true,
  launchedKeys,
  ...handlerProps
}) => {
  const handlers = React.useRef<Handlers>(handlerProps);
  handlers.current = handlerProps;

  const latestPlanBlockId = React.useMemo(() => {
    for (let i = blocks.length - 1; i >= 0; i--) {
      const b = blocks[i];
      if (b.type === 'text' && !b.variant && planOf(b.content)) return b.id;
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

  const launchedSet = React.useMemo(() => new Set(launchedKeys ?? []), [launchedKeys]);

  return (
    <div className={`flex flex-col gap-3.5 ${className}`}>
      {blocks.map((block, index) => {
        let launched = false;
        if (block.type === 'text' && launchedSet.size > 0) {
          const plan = planOf(block.content);
          launched = Boolean(plan && launchedSet.has(plan.tasks.map((task) => task.title).join('\n')));
        }
        return (
          <FeedBlock
            key={block.id}
            block={block}
            isLatestText={index === lastTextIndex}
            isLatestPlan={block.id === latestPlanBlockId}
            launched={launched}
            canUseWorktree={canUseWorktree}
            isActive={isActive}
            handlers={handlers}
          />
        );
      })}
    </div>
  );
};

export const AgentSessionFeed = React.memo(AgentSessionFeedImpl);
AgentSessionFeed.displayName = 'AgentSessionFeed';

export default AgentSessionFeed;
