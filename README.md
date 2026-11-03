# Design Workspace

This app is a workspace for design ideation. It is a prototype for HCI research.

You write a design brief. The app uses Gemini models to make concepts, motifs and images from the brief. You keep the ideas in a tree. You sort the ideas into collections.

---

## Requirements

- Node.js 22 or a newer version.
- A Gemini API key.

---

## Set the API key

The server reads the key from the `GEMINI_API_KEY` environment variable.

Do one of these two procedures:

**Procedure A: use your shell profile**

1. Open `~/.zshrc`.
2. Add this line: `export GEMINI_API_KEY=your_key`.
3. Open a new terminal.

**Procedure B: use a local file**

1. Copy `.env.local.example` to `.env.local`.
2. In `.env.local`, replace `your_api_key_here` with your key.

Note: If you set the key in your shell, the app uses that key. It does not use the key in `.env.local`.

CAUTION: Do not put the key in a file that git tracks. Git ignores `.env*.local` files.

---

## Start the app

1. Go to the `workspace` folder.
2. Type `npm install`.
3. Type `npm run dev`.
4. Open http://localhost:3000 in your browser.

---

## Do the tests

Do these commands before you commit a change:

| Command | Function |
| --- | --- |
| `npm test` | Does the unit tests (Vitest). |
| `npm run typecheck` | Finds TypeScript errors. |
| `npm run build` | Makes a production build. |

---

## How to use the app

### Projects

The first page (`/`) shows all projects.

- Click **New project** to make a project.
- Click **Upload project** to open a project file as a new project. To make a project file, use **Export project (with images)** in the project menu.
- Click a project card to open the project.
- Use the **⋯** menu on a card to rename, export or delete the project.

An upload does not change the project that you exported. The new project has its own ID, so it does not replace a project in this browser, even if it has the same name.

Each project has its own brief, tree and collections.

### The tree view

The tree view shows the brief at the top. Each idea is a node. A line goes from each node to the node it came from.

There are four types of node:

- **Concept**: an idea in words.
- **Motif**: a visual element or pattern.
- **Visual**: an image.
- **Note**: your own text.

You can change the type of a node.

The tree has three tools:

- **Select**: click a node to select it. Hold Shift to select more nodes.
- **Lasso**: drag around nodes to select them.
- **Connect**: drag from one node to a different node to connect them.

### The collections view

Use collections to sort ideas into groups. One node can be in many collections.

### Actions

Select one or more nodes. Then select an action on the toolbar. A window opens. In the window, set the options and click the run button.

| Action | Input | Output |
| --- | --- | --- |
| **Expand** | Nodes, images or connections | New concepts and motifs. Use the sliders to set the quantity (maximum 10 of each). |
| **Visual variations** | Ideas | One image for each visual dimension that you select: Balance, Shape, Light, Color or Dynamics. The dimensions come from Rudolf Arnheim. |
| **Visualize** | Ideas or connections | Images that show the idea. Use the slider to set the quantity (maximum 4 for each idea). |

The app sends a maximum of 4 requests at the same time. If some requests fail, you can try again. The app sends only the failed requests again.

When you expand an image, the model can mark an area of the image. The new node shows that area.

### Connections

A connection tells how two nodes connect. There are two types:

- A run makes a connection from each input to each output. A run on the brief alone makes a connection from the brief to each output.
- You make a connection when you use the **Connect** tool, or when you use **Connect to another node** in the panel of a node.

A connection has three parts:

- **Reading**: the type of connection. The roles of the two nodes set the reading. The model does not choose it.
- **Word**: one to three words that give the main idea.
- **Explanation**: one or two sentences about how the two nodes connect.

To get the word and the explanation, the prompt asks the model a question. The question depends on the roles of the two nodes:

| From → to | Reading | Question in the prompt |
| --- | --- | --- |
| Concept → motif | embodied as | How does this motif give visual form to the concept? |
| Motif → concept | connotes | What does this visual quality connote or stand for? |
| Image → concept | suggests | What in the image suggests this idea? |
| Image → motif | contains | Where and how does this quality appear in the image? |
| Concept → image | expressed in | How does the image express the concept? |
| Motif → image | applied in | How is the motif used in the image? |
| Image → image | varied as | What changed, and what does the change do? |
| Concept → concept | leads to | How does the new idea follow from, push on, or reframe the input? |
| Motif → motif | becomes | How does the new motif develop the input motif? |
| Brief → concept | suggests | What in the brief suggests this idea? |
| Brief → motif | embodied as | How does this motif give visual form to the brief? |
| Other pairs | relates to | How do these two connect? |

The table is in `src/domain/relations.ts`.

The word is at the middle of the line. If a node or a different word is at that location, the word moves along the line to the nearest free location.

To open a connection, click its line or its word on the tree. You can then do these tasks:

- Change the word and the explanation.
- Click **Suggest connection** to let the model write them. If the connection has text, the button is **Suggest again**, and a message shows an **Undo** button.
- Use **Explore this connection** to run an action on the connection. **Expand** makes ideas between the two nodes. **Visualize** makes an image that shows one node through the other.
- Click **Remove connection**. If a run made the connection, the output node can move in the tree.

Note: You cannot explore a connection from the brief, because a run cannot use the brief as an input node.

Note: For now, each pair has one fixed reading. Later, each pair can have a short list of readings. For example, image → concept can be *suggests*, *contrasts with* or *evokes*. The model or the designer can then choose one. The connection then keeps the chosen reading. A study can then compare readings that the model chose with readings that the designer chose.

### To do

- **Visualize** and **Visual variations** do not write the text of their connections. They make the connections, but the word and the explanation are empty. Until this is done, use **Suggest connection** on these connections. The plan is to make one text call after each image. This call adds a small cost for each image.

### Remove and undo

When you remove a node, the app hides it. The tree connects the children of the node to its parent. A message shows an **Undo** button.

### Cost

The header shows the approximate cost of the project. The app counts the tokens that Gemini reports. This count includes retries and failed calls.

The prices are in `src/domain/pricing.ts`. Make sure that the prices are correct before a study.

---

## Data

### Where the app keeps data

The app keeps all projects in the browser, in IndexedDB. The data stays on one computer and in one browser.

CAUTION: If you clear the browser data, you delete all projects. Export the projects and the study logs first.

### Project files

A project file contains the full project, its images and its event log. Use it to make a backup, or to move a project to a different browser or computer. The file name ends in `.project.json`. Files with many images can be large.

A project file is not a study log. You cannot upload a study log, because it has no images or layout.

Note: An uploaded project keeps its event log and its cost. If you upload a project to the browser that has the original project, **Export all study logs** and the total cost on the first page count that project two times. The log of the new project has a `project.uploaded` event with the ID of the original project.

### Study logs

The app records each change as an event. To export the events:

- For one project: use **Export study log (JSON)** in the project menu.
- For all projects: on the first page, click **Export all study logs**.

Each file contains:

- The project data.
- All events in the sequence that they occurred.
- A snapshot of all nodes, connections and collections. The snapshot includes removed items.

The file does not contain image data. It contains only image IDs.

### Debug logs

The server writes each model call to the `logs/` folder. The folder name has the date, the run ID and the action. Git ignores this folder.

---

## Folder structure

| Folder or file | Contents |
| --- | --- |
| `app/` | Pages and the API route (`app/api/actions/[id]/route.ts`). |
| `src/domain/` | Types, graph functions, updates, tree layout and prices. This code has no browser or server dependencies. |
| `src/db/` | The storage interface and the IndexedDB (Dexie) implementation. |
| `src/store/` | The project store (Zustand). All changes go through this store. |
| `src/services/` | Run plans, API calls, image conversion and log export. |
| `src/server/` | Prompts, request validation, model calls and the action registry. This code runs only on the server. |
| `src/components/` | The React components. |
| `tests/` | The unit tests. |
| `prompts.txt` | The prompt text for the image actions. |

---

## How to change the app

| To change | Edit |
| --- | --- |
| The models | `src/server/model.ts` (`TEXT_MODEL` and `IMAGE_MODEL`) |
| The prompts | `prompts.txt` and `src/server/prompts.ts` |
| The connection readings and questions | `src/domain/relations.ts` |
| The prices | `src/domain/pricing.ts` |
| The visual dimensions | `src/lib/dimensions.ts`. Remove `hidden: true` to show a dimension again. |
| The default and maximum quantities | `src/domain/wire.ts` |

When you add a function, add a test for it in `tests/`.
