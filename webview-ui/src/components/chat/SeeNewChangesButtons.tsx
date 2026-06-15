import { useCallback, useState } from "react"
import { useTranslation } from "react-i18next"
import { VSCodeButton } from "@vscode/webview-ui-toolkit/react"

import type { CompletionCheckpoint } from "@roo-code/types"

import { vscode } from "@src/utils/vscode"

export const SeeNewChangesButtons = ({ checkpoint }: { checkpoint: CompletionCheckpoint }) => {
	const { t } = useTranslation()
	const [restoringChanges, setRestoringChanges] = useState(false)

	const seeNewChangesCallback = useCallback(() => {
		vscode.postMessage({ type: "completionCheckpointDiff", checkpointTs: checkpoint.ts })
	}, [checkpoint.ts])

	const restoreChangesCallback = useCallback(() => setRestoringChanges(true), [])

	const confirmRestoreChangesCallback = useCallback(() => {
		vscode.postMessage({ type: "completionCheckpointRestore", checkpointTs: checkpoint.ts })
	}, [checkpoint.ts])

	const cancelRestoreChangesCallback = useCallback(() => setRestoringChanges(false), [])

	return (
		<div className="flex flex-horizontal gap-2 w-full">
			{restoringChanges ? (
				<>
					<VSCodeButton
						className="w-full mt-2 bg-red-500 text-white"
						disabled={!checkpoint.commitHash}
						onClick={confirmRestoreChangesCallback}>
						{t("chat:checkpoint.menu.confirm")} {t("chat:restoreChanges.title")}
					</VSCodeButton>
					<VSCodeButton className="w-full mt-2" appearance="secondary" onClick={cancelRestoreChangesCallback}>
						{t("chat:checkpoint.menu.cancel")}
					</VSCodeButton>
				</>
			) : (
				<>
					<VSCodeButton
						className="w-full mt-2"
						appearance="secondary"
						title={t("chat:seeNewChanges.tooltip")}
						onClick={seeNewChangesCallback}>
						{t("chat:seeNewChanges.title")}
					</VSCodeButton>
					<VSCodeButton
						className="w-full mt-2"
						appearance="secondary"
						title={t("chat:restoreChanges.tooltip")}
						disabled={!checkpoint.commitHash}
						onClick={restoreChangesCallback}>
						{t("chat:restoreChanges.title")}
					</VSCodeButton>
				</>
			)}
		</div>
	)
}
