import {unpack} from "./unpacker";
import {MavenJspmProxy} from "./maven-proxy";


export async function getVersions(mavenProxy:MavenJspmProxy, groupId: string, packageName: string) {
	const packageGroups = packageName.split("/");
	const artifactId = packageGroups.pop();
	const fullGroupId = [groupId].concat(packageGroups).join(".");
	const versions: string[] = await mavenProxy.sendRequest<string[]>({ command: "versions", groupId: fullGroupId, artifactId: artifactId });
	return versions.map((version) => {
		return {
			version: version,
			artifact: {
				groupId: groupId,
				artifactId: artifactId,
				version: version
			}
		};
	});
}

export async function downloadPackage(mavenProxy:MavenJspmProxy, meta: any, outDir: string) {
	const resPath = await mavenProxy.sendRequest<string>({ command: "download", groupId: meta.artifact.groupId, artifactId: meta.artifact.artifactId, version: meta.artifact.version });
	await unpack(resPath, outDir);
}
