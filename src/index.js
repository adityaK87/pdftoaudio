const express = require("express");
const multer = require("multer");
const fs = require("fs-extra");
const path = require("path");
const pdfParse = require("pdf-parse");
const gtts = require("gtts");
const Tesseract = require("tesseract.js");

const app = express();
const uploadFolder = path.join(__dirname, "uploads");

// Ensure the upload folder exists
fs.ensureDirSync(uploadFolder);

// Multer configuration for file uploads
const storage = multer.diskStorage({
	destination: (req, file, cb) => cb(null, uploadFolder),
	filename: (req, file, cb) => cb(null, file.originalname),
});
const upload = multer({ storage });

// Serve the index.html page
app.get("/", (req, res) => {
	res.sendFile(path.join(__dirname, "index.html"));
});

// Function to convert PDF to MP3
const pdfToMp3 = async (filePath, language = "en") => {
	let text = "";

	// Step 1: Attempt text extraction using pdf-parse
	try {
		const fileData = await fs.readFile(filePath);
		const data = await pdfParse(fileData);
		text = data.text || "";
	} catch (err) {
		console.error("Error during PDF parsing:", err);
	}

	// Step 2: If no text, use OCR with tesseract.js
	if (!text.trim()) {
		console.log("Text extraction failed, using OCR...");
		const {
			data: { text: ocrText },
		} = await Tesseract.recognize(filePath, language);
		text = ocrText;
	}

	// Step 3: Clean up the text
	text = text.replace(/\n/g, " ");
	if (!text.trim()) return null;

	// Step 4: Convert text to speech using gTTS
	const fileName = path.parse(filePath).name;
	const outputPath = path.join(uploadFolder, `${fileName}.mp3`);
	const speech = new gtts(text, language);
	await new Promise((resolve, reject) => {
		speech.save(outputPath, (err) => {
			if (err) return reject(err);
			resolve();
		});
	});

	return outputPath;
};

// Handle file uploads and conversion
app.post("/convert", upload.single("file"), async (req, res) => {
	if (!req.file) {
		return res.status(400).json({ error: "No file uploaded" });
	}

	const language = req.body.language || "en";

	try {
		const result = await pdfToMp3(req.file.path, language);
		if (result) {
			const fileUrl = `/download/${path.basename(result)}`;
			res.json({ success: true, file_url: fileUrl });
		} else {
			res.status(500).json({
				error: "Failed to extract text from the PDF",
			});
		}
	} catch (err) {
		console.error("Error during conversion:", err);
		res.status(500).json({ error: "Internal server error" });
	}
});

// Handle file downloads
app.get("/download/:filename", (req, res) => {
	const filePath = path.join(uploadFolder, req.params.filename);
	res.download(filePath);
});

// Start the server
const PORT = 3000;
app.listen(PORT, () =>
	console.log(`Server running on http://localhost:${PORT}`)
);
