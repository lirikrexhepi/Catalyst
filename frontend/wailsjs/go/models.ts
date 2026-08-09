export namespace auth {
	
	export class Credential {
	    providerId: string;
	    accessToken?: string;
	    refreshToken?: string;
	    sessionKey?: string;
	    tokenType: string;
	    expiresAt: string;
	    isLinked: boolean;
	
	    static createFrom(source: any = {}) {
	        return new Credential(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.providerId = source["providerId"];
	        this.accessToken = source["accessToken"];
	        this.refreshToken = source["refreshToken"];
	        this.sessionKey = source["sessionKey"];
	        this.tokenType = source["tokenType"];
	        this.expiresAt = source["expiresAt"];
	        this.isLinked = source["isLinked"];
	    }
	}
	export class DetectedAgent {
	    id: string;
	    providerId: string;
	    name: string;
	    sourcePath: string;
	    isAvailable: boolean;
	    description: string;
	
	    static createFrom(source: any = {}) {
	        return new DetectedAgent(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.providerId = source["providerId"];
	        this.name = source["name"];
	        this.sourcePath = source["sourcePath"];
	        this.isAvailable = source["isAvailable"];
	        this.description = source["description"];
	    }
	}

}

