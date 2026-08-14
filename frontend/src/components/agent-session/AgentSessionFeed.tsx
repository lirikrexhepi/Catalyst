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

export interface AgentSessionFeedProps {
  blocks: AgentStreamBlock[];
  className?: string;
  onApprovePlan?: (blockId: string) => void;
  onAnswerQuestion?: (blockId: string, selectedKey: string, customText?: string) => void;
  onSkipQuestion?: (blockId: string) => void;
  onFileClick?: (path: string) => void;
}

/**
 * AgentSessionFeed Component
 * Dynamic dispatcher that renders a stream of CLI / AI SDK events into their respective glass UI components.
 */
const AgentSessionFeedImpl: React.FC<AgentSessionFeedProps> = ({
  blocks,
  className = '',
  onApprovePlan,
  onAnswerQuestion,
  onSkipQuestion,
  onFileClick,
}) => {
  return (
    <div className={`flex flex-col gap-3.5 ${className}`}>
      {blocks.map((block) => {
        switch (block.type) {
          case 'user':
            return (
              <UserChatBubble
                key={block.id}
                message={block.content}
              />
            );

          case 'text':
            return (
              <div
                key={block.id}
                className="text-[12px] font-medium font-['Geist'] text-white/90 leading-relaxed pl-0.5 select-text"
              >
                {block.content}
                {block.isStreaming && (
                  <span className="inline-block w-1.5 h-3 bg-white/70 ml-1 animate-pulse" />
                )}
              </div>
            );

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
                blockId={block.id}
                onAnswerBlock={onAnswerQuestion}
                onSkipBlock={onSkipQuestion}
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
