import { getCompletionCheckpoint, type ClineMessage } from "@roo-code/types"

describe("getCompletionCheckpoint", () => {
	it("returns the checkpoint created after the latest user prompt before completion", () => {
		const messages: ClineMessage[] = [
			{ type: "say", say: "text", ts: 1, text: "Initial task" },
			{ type: "say", say: "checkpoint_saved", ts: 2, text: "initial-checkpoint" },
			{ type: "say", say: "completion_result", ts: 3, text: "First completion" },
			{ type: "say", say: "user_feedback", ts: 4, text: "Change it" },
			{ type: "say", say: "checkpoint_saved", ts: 5, text: "latest-prompt-checkpoint" },
			{ type: "ask", ask: "completion_result", ts: 6, text: "", partial: false },
		]

		expect(getCompletionCheckpoint(messages)).toEqual({
			ts: 5,
			commitHash: "latest-prompt-checkpoint",
		})
	})
})
