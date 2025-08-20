# Auto Typer — Natural Typing (Chrome Extension)

This extension types the paragraph you provide into the currently focused input/textarea/contenteditable field, simulating natural human typing with random delays and optional small mistakes.

## Install (Developer Mode)

1. Download and extract the ZIP, or keep the folder as-is.
2. Open **chrome://extensions** in Chrome.
3. Enable **Developer mode** (top-right toggle).
4. Click **Load unpacked** and select the `auto-typer-extension` folder.

## Use

- Focus the field where you want the text to be typed.
- Click the extension icon → paste your text → **Start typing**, or press **Alt+Shift+T** to start with the last saved text.
- Press **Alt+Shift+S** or click **Stop** in the popup to stop mid-way.

## Options

- **Min/Max delay (ms/char):** controls the typing speed variability.
- **Mistake rate (%):** inserts occasional wrong character + backspace, to feel more human.
- **Smart punctuation:** converts "..." to …, "--" to —, and straight quotes to curly ones.
- **Press Enter at the end:** simulates pressing Enter after typing.

## Notes

- Works in most inputs, textareas, and `contenteditable` editors (Gmail, Docs-like editors may vary).
- It updates the value via native events so most frameworks detect the change.
