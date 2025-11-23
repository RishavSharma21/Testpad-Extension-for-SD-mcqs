# Quiz Auto-Solver (Testpad Extension)

This Chrome extension helps automate multiple-choice quizzes on the Testpad learning platform. It follows a deterministic workflow:

1. Selects the answer option with the longest text (usually the most descriptive choice).
2. Submits the attempt and waits for Testpad to reveal the verified answer.
3. Switches to the platform-marked correct option, re-submits, and progresses to the next question.
4. Remembers question state within a session so the bot does not rework completed prompts unless explicitly restarted.

> ⚠️ **Use responsibly.** This tool is intended for study and experimentation. Relying on automated answers during assessments may violate your institution’s policies.

## Features

- Works with Testpad’s MCQ layout (radio inputs and feedback labels).
- Avoids feedback/report widgets to prevent accidental reporting.
- Configurable start/stop control via the popup window.
- Persists running state so a page refresh continues automatically.

## Folder Structure

```
content.js        # Core automation script injected into quiz pages
manifest.json     # Chrome extension manifest (MV3)
popup.html        # Popup UI layout (start/stop buttons)
popup.js          # Popup logic sending control messages
```

## Installation (Developer Mode)

1. Download or clone this repository.
2. Open Chrome and navigate to `chrome://extensions`.
3. Enable **Developer mode** (toggle in the top-right corner).
4. Click **Load unpacked** and choose this project folder.
5. Pin the extension for quick access (optional).

## Usage

1. Open a Testpad quiz page that uses multiple-choice radio buttons.
2. Click the extension icon and press **Start Bot**.
3. Watch the console (`F12` → **Console**) for `[quizBot]` logs to monitor progress.
4. Press **Stop Bot** at any time to halt automation.

### Tips

- Refresh the quiz page after updating the extension so the latest `content.js` is injected.
- If you encounter a new quiz layout, capture the DOM structure and adjust detection logic in `content.js` accordingly.

## Development Notes

- The automation relies on DOM heuristics for question prompts, correct-answer badges, and navigation buttons. For major UI changes, update helper functions like `findQuestionPanel`, `detectCorrectOption`, and `findNextInPanel`.
- When testing new logic, keep DevTools open and set `localStorage.setItem('quizBotRunning','false')` if the loop gets stuck.
- Resetting the bot from the popup clears the per-session state stored in `sessionStorage`.

## Contributing

Pull requests are welcome. Please describe the scenario you are fixing or improving, add console/log screenshots if relevant, and ensure the extension still operates across consecutive questions.

## License

This project is released under the MIT License. See [`LICENSE`](LICENSE) for details (add one if required).
