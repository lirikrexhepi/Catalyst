export namespace domain {
	
	export class ApprovalOption {
	    id: string;
	    name: string;
	    kind: string;
	
	    static createFrom(source: any = {}) {
	        return new ApprovalOption(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.name = source["name"];
	        this.kind = source["kind"];
	    }
	}
	export class FileDiff {
	    path: string;
	    oldText?: string;
	    newText?: string;
	
	    static createFrom(source: any = {}) {
	        return new FileDiff(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.path = source["path"];
	        this.oldText = source["oldText"];
	        this.newText = source["newText"];
	    }
	}
	export class ToolCall {
	    id: string;
	    name: string;
	    kind?: string;
	    status: string;
	    input?: Record<string, any>;
	    output?: string;
	    diffs?: FileDiff[];
	
	    static createFrom(source: any = {}) {
	        return new ToolCall(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.name = source["name"];
	        this.kind = source["kind"];
	        this.status = source["status"];
	        this.input = source["input"];
	        this.output = source["output"];
	        this.diffs = this.convertValues(source["diffs"], FileDiff);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class ApprovalRequest {
	    requestId: string;
	    title: string;
	    detail?: string;
	    tool?: ToolCall;
	    options?: ApprovalOption[];
	
	    static createFrom(source: any = {}) {
	        return new ApprovalRequest(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.requestId = source["requestId"];
	        this.title = source["title"];
	        this.detail = source["detail"];
	        this.tool = this.convertValues(source["tool"], ToolCall);
	        this.options = this.convertValues(source["options"], ApprovalOption);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	
	export class FileRef {
	    path: string;
	    mime?: string;
	
	    static createFrom(source: any = {}) {
	        return new FileRef(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.path = source["path"];
	        this.mime = source["mime"];
	    }
	}
	export class OptionChoice {
	    id: string;
	    label: string;
	    default?: boolean;
	
	    static createFrom(source: any = {}) {
	        return new OptionChoice(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.label = source["label"];
	        this.default = source["default"];
	    }
	}
	export class OptionDescriptor {
	    id: string;
	    label: string;
	    type: string;
	    choices?: OptionChoice[];
	    default?: any;
	
	    static createFrom(source: any = {}) {
	        return new OptionDescriptor(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.label = source["label"];
	        this.type = source["type"];
	        this.choices = this.convertValues(source["choices"], OptionChoice);
	        this.default = source["default"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class Model {
	    id: string;
	    displayName: string;
	    default?: boolean;
	    options?: OptionDescriptor[];
	
	    static createFrom(source: any = {}) {
	        return new Model(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.displayName = source["displayName"];
	        this.default = source["default"];
	        this.options = this.convertValues(source["options"], OptionDescriptor);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	
	
	export class PlanEntry {
	    content: string;
	    status: string;
	    priority?: string;
	
	    static createFrom(source: any = {}) {
	        return new PlanEntry(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.content = source["content"];
	        this.status = source["status"];
	        this.priority = source["priority"];
	    }
	}
	export class ProviderSettings {
	    binaryPath?: string;
	    launchArgs?: string;
	    env?: Record<string, string>;
	    serverUrl?: string;
	    apiEndpoint?: string;
	    model?: string;
	    enabled: boolean;
	
	    static createFrom(source: any = {}) {
	        return new ProviderSettings(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.binaryPath = source["binaryPath"];
	        this.launchArgs = source["launchArgs"];
	        this.env = source["env"];
	        this.serverUrl = source["serverUrl"];
	        this.apiEndpoint = source["apiEndpoint"];
	        this.model = source["model"];
	        this.enabled = source["enabled"];
	    }
	}
	export class ProviderSnapshot {
	    instanceId: string;
	    driver: string;
	    displayName: string;
	    availability: string;
	    version?: string;
	    commandPath?: string;
	    message?: string;
	    models?: Model[];
	    checkedAt: number;
	
	    static createFrom(source: any = {}) {
	        return new ProviderSnapshot(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.instanceId = source["instanceId"];
	        this.driver = source["driver"];
	        this.displayName = source["displayName"];
	        this.availability = source["availability"];
	        this.version = source["version"];
	        this.commandPath = source["commandPath"];
	        this.message = source["message"];
	        this.models = this.convertValues(source["models"], Model);
	        this.checkedAt = source["checkedAt"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class Usage {
	    inputTokens?: number;
	    outputTokens?: number;
	    cacheReadTokens?: number;
	    cacheWriteTokens?: number;
	    contextWindow?: number;
	    costUsd?: number;
	
	    static createFrom(source: any = {}) {
	        return new Usage(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.inputTokens = source["inputTokens"];
	        this.outputTokens = source["outputTokens"];
	        this.cacheReadTokens = source["cacheReadTokens"];
	        this.cacheWriteTokens = source["cacheWriteTokens"];
	        this.contextWindow = source["contextWindow"];
	        this.costUsd = source["costUsd"];
	    }
	}
	export class RuntimeEvent {
	    kind: string;
	    threadId: string;
	    turnId?: string;
	    instanceId?: string;
	    driver?: string;
	    seq: number;
	    at: number;
	    text?: string;
	    delta?: boolean;
	    tool?: ToolCall;
	    plan?: PlanEntry[];
	    approval?: ApprovalRequest;
	    usage?: Usage;
	    stopReason?: string;
	    error?: string;
	
	    static createFrom(source: any = {}) {
	        return new RuntimeEvent(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.kind = source["kind"];
	        this.threadId = source["threadId"];
	        this.turnId = source["turnId"];
	        this.instanceId = source["instanceId"];
	        this.driver = source["driver"];
	        this.seq = source["seq"];
	        this.at = source["at"];
	        this.text = source["text"];
	        this.delta = source["delta"];
	        this.tool = this.convertValues(source["tool"], ToolCall);
	        this.plan = this.convertValues(source["plan"], PlanEntry);
	        this.approval = this.convertValues(source["approval"], ApprovalRequest);
	        this.usage = this.convertValues(source["usage"], Usage);
	        this.stopReason = source["stopReason"];
	        this.error = source["error"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class SendTurnInput {
	    threadId: string;
	    turnId: string;
	    text: string;
	    files?: FileRef[];
	
	    static createFrom(source: any = {}) {
	        return new SendTurnInput(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.threadId = source["threadId"];
	        this.turnId = source["turnId"];
	        this.text = source["text"];
	        this.files = this.convertValues(source["files"], FileRef);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class Session {
	    threadId: string;
	    instanceId: string;
	    driver: string;
	    providerSessionId?: string;
	    cwd: string;
	    model?: string;
	    startedAt: number;
	
	    static createFrom(source: any = {}) {
	        return new Session(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.threadId = source["threadId"];
	        this.instanceId = source["instanceId"];
	        this.driver = source["driver"];
	        this.providerSessionId = source["providerSessionId"];
	        this.cwd = source["cwd"];
	        this.model = source["model"];
	        this.startedAt = source["startedAt"];
	    }
	}
	export class SessionStartInput {
	    threadId: string;
	    instanceId: string;
	    cwd: string;
	    model?: string;
	    permissionMode?: string;
	    resume?: string;
	    options?: Record<string, any>;
	    planOnly?: boolean;
	
	    static createFrom(source: any = {}) {
	        return new SessionStartInput(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.threadId = source["threadId"];
	        this.instanceId = source["instanceId"];
	        this.cwd = source["cwd"];
	        this.model = source["model"];
	        this.permissionMode = source["permissionMode"];
	        this.resume = source["resume"];
	        this.options = source["options"];
	        this.planOnly = source["planOnly"];
	    }
	}
	export class Worktree {
	    path: string;
	    branch: string;
	    baseBranch: string;
	    createdAt: number;
	
	    static createFrom(source: any = {}) {
	        return new Worktree(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.path = source["path"];
	        this.branch = source["branch"];
	        this.baseBranch = source["baseBranch"];
	        this.createdAt = source["createdAt"];
	    }
	}
	export class Task {
	    id: string;
	    workspaceId: string;
	    threadId: string;
	    title: string;
	    prompt: string;
	    driver: string;
	    model?: string;
	    state: string;
	    worktree?: Worktree;
	    summary?: string;
	    createdAt: number;
	    updatedAt: number;
	
	    static createFrom(source: any = {}) {
	        return new Task(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.workspaceId = source["workspaceId"];
	        this.threadId = source["threadId"];
	        this.title = source["title"];
	        this.prompt = source["prompt"];
	        this.driver = source["driver"];
	        this.model = source["model"];
	        this.state = source["state"];
	        this.worktree = this.convertValues(source["worktree"], Worktree);
	        this.summary = source["summary"];
	        this.createdAt = source["createdAt"];
	        this.updatedAt = source["updatedAt"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class TaskHandoff {
	    taskId: string;
	    branch: string;
	    filesChanged: number;
	    insertions: number;
	    deletions: number;
	    commits: number;
	    conflicts?: string[];
	    cleanMerge: boolean;
	    summary?: string;
	
	    static createFrom(source: any = {}) {
	        return new TaskHandoff(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.taskId = source["taskId"];
	        this.branch = source["branch"];
	        this.filesChanged = source["filesChanged"];
	        this.insertions = source["insertions"];
	        this.deletions = source["deletions"];
	        this.commits = source["commits"];
	        this.conflicts = source["conflicts"];
	        this.cleanMerge = source["cleanMerge"];
	        this.summary = source["summary"];
	    }
	}
	
	
	export class Workspace {
	    id: string;
	    title: string;
	    prompt: string;
	    cwd: string;
	    createdAt: number;
	    updatedAt: number;
	    archived?: boolean;
	
	    static createFrom(source: any = {}) {
	        return new Workspace(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.title = source["title"];
	        this.prompt = source["prompt"];
	        this.cwd = source["cwd"];
	        this.createdAt = source["createdAt"];
	        this.updatedAt = source["updatedAt"];
	        this.archived = source["archived"];
	    }
	}

}

export namespace session {
	
	export class Config {
	    driver: string;
	    model?: string;
	    options?: Record<string, any>;
	    cwd?: string;
	    permissionMode?: string;
	
	    static createFrom(source: any = {}) {
	        return new Config(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.driver = source["driver"];
	        this.model = source["model"];
	        this.options = source["options"];
	        this.cwd = source["cwd"];
	        this.permissionMode = source["permissionMode"];
	    }
	}
	export class SpawnOptions {
	    driver: string;
	    model?: string;
	    options?: Record<string, any>;
	    cwd: string;
	    useWorktree: boolean;
	    workspaceId?: string;
	    title?: string;
	    prompt?: string;
	
	    static createFrom(source: any = {}) {
	        return new SpawnOptions(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.driver = source["driver"];
	        this.model = source["model"];
	        this.options = source["options"];
	        this.cwd = source["cwd"];
	        this.useWorktree = source["useWorktree"];
	        this.workspaceId = source["workspaceId"];
	        this.title = source["title"];
	        this.prompt = source["prompt"];
	    }
	}
	export class SpawnRequest {
	    title: string;
	    prompt: string;
	    driver?: string;
	    model?: string;
	    options?: Record<string, any>;
	    cwd?: string;
	
	    static createFrom(source: any = {}) {
	        return new SpawnRequest(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.title = source["title"];
	        this.prompt = source["prompt"];
	        this.driver = source["driver"];
	        this.model = source["model"];
	        this.options = source["options"];
	        this.cwd = source["cwd"];
	    }
	}
	export class SpawnResult {
	    workspace: domain.Workspace;
	    tasks: domain.Task[];
	    errors?: string[];
	
	    static createFrom(source: any = {}) {
	        return new SpawnResult(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.workspace = this.convertValues(source["workspace"], domain.Workspace);
	        this.tasks = this.convertValues(source["tasks"], domain.Task);
	        this.errors = source["errors"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class TaskRequest {
	    title: string;
	    prompt: string;
	    cwd?: string;
	
	    static createFrom(source: any = {}) {
	        return new TaskRequest(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.title = source["title"];
	        this.prompt = source["prompt"];
	        this.cwd = source["cwd"];
	    }
	}

}

