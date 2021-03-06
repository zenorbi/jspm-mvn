import {createMavenConnection, MavenConnection} from "./maven-connector";
import * as Bluebird from "bluebird";
import * as fs from "fs";
import * as path from "path";
import { SingleValueCache } from "./utils/cache";

const readFile = Bluebird.promisify<string, string, string>(fs.readFile);
const access = Bluebird.promisify<void, string, number>(fs.access);

export class MavenJspmProxy {
	private _mavenConnectionCache = new SingleValueCache<MavenConnection>();
	private _requestCounter = 0;
	private _packageJsonPath:string;
	private _packageJsonCache: Promise<any>|undefined;

	constructor(packageJsonPath:string) {
		this._packageJsonPath = packageJsonPath;
		this._packageJsonCache = undefined;
	}

	private async _readPackageJson() {
		const packageJson = await readFile(this._packageJsonPath, "utf-8");
		const json = JSON.parse(packageJson);
		return json;
	}

	public async getPackageJson(): Promise<any> {
		if (!this._packageJsonCache) {
			this._packageJsonCache = this._readPackageJson();
		}
		return await this._packageJsonCache;
	}

	private async _getPossiblePomPath() {
		const json = await this.getPackageJson();
		if (typeof json.jspm === "object" && typeof json.jspm.pomPath === "string") {
			return path.resolve(path.dirname(this._packageJsonPath), json.jspm.pomPath);
		} else {
			return path.resolve(path.dirname(this._packageJsonPath), "pom.xml");
		}
	}

	private async _getPomPath() {
		const possiblePomPath = await this._getPossiblePomPath();
		const constants = fs.constants;
		const R_OK = typeof constants === "object" ? constants.R_OK : (<any>fs).R_OK;
		try {
			await access(possiblePomPath, R_OK);
		} catch(e) {
			throw Error(`jspm-mvn: Failed to access ${possiblePomPath}. Make sure the pom.xml is either in your current working directory, or configure jspm.pomPath in your package.json file. The path is relative to the package.json file.`);
		}
		return possiblePomPath;
	}

	private async _createMavenConnection() {
		const pomPath = await this._getPomPath();
		const env = new Map<string, string>();
		env.set("pomfile", pomPath);
		return await createMavenConnection(env);
	}

	private _getMavenConnection() {
		return this._mavenConnectionCache.get(async () => {
			return await this._createMavenConnection();
		});
	}

	async sendRequest<T>(command: any) {
		const connection = await this._getMavenConnection();
		return await new Promise<T>((resolve, reject) => {
			const requestId = ++this._requestCounter;

			connection.retain();
			connection.writer.write([requestId, command]);

			connection.reader.addListener("data", function reader(json: any) {
				if (json[0] === requestId) {
					connection.reader.removeListener("data", reader);

					connection.release();

					if (typeof json[1] === "object" && json[1].errored) {
						reject(new Error(json[1].message));
						return;
					}
					resolve(json[1]);
				}
			});
		});
	}
}
