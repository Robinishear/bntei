const express = require("express");
const cors = require("cors");
const multer = require("multer");
const axios = require("axios");
const FormData = require("form-data");
const admin = require("firebase-admin");

const path = require("path");
const sharp = require("sharp");
const fetch = require("node-fetch");
const puppeteer = require("puppeteer");
const fontkit = require("@pdf-lib/fontkit");
const qrcode = require("qrcode");

const { PDFDocument, StandardFonts, rgb } = require("pdf-lib");

const fs = require("fs");
require("dotenv").config();
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");

const app = express();
const PORT = process.env.PORT || 5000;

//imageUpload
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

// Middleware
app.use(cors());
app.use(express.json());

const decoded = Buffer.from(process.env.FB_SERVICE_KEY, "base64").toString(
  "utf8",
);
const serviceAccount = JSON.parse(decoded);

// uri
const uri = `mongodb+srv://medical-center:bQAniIDxkQ77stdB@cluster0.rdqbvqq.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;
// MongoDB setup
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

//firebase Access token validation copied from fb service account

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

// Middleware to check for a valid access token

async function run() {
  try {
    // Connect the client to the server (optional starting in v4.7)
    await client.connect();
    // Send a ping to confirm a successful connection
    await client.db("admin").command({
      ping: 1,
    });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!",
    );
    const db = client.db("medical-center");

    // ------------------- Collections ------------------
    const branchesCollection = db.collection("users");
    const coursesCollection = db.collection("courses");
    const studentsCollection = db.collection("StudentsList");
    const footerCollection = db.collection("footer");
    const cardsCollection = db.collection("cards");
    const successStudentsCollection = db.collection("successStudents");
    const homeSliderCollection = db.collection("homeSlider");
    const InfoCardCollection = db.collection("InfoCard ");
    const subjectSuggestionCollection = db.collection("subjectSuggestion");
    const countersCollection = db.collection("counters");
    const Question = db.collection("Question");
    const OMRSheetCollection = () => db.collection("OMRSheet");
    const noticeboardyourpdfCollection = () =>
      db.collection("noticeboardyourpdf");
    const AllTableCollection = () => db.collection("AllTable");
    const AdminMessageOMRSheetCollection = () =>
      db.collection("AdminMessageOMRSheet");
    const ExamSuggestionCollection = () => db.collection("ExamSuggestion");
    const OnlineExamPageAddAdminCollection = () =>
      db.collection("OnlineExamPageAddAdmin");
    const NoticeAddCollection = db.collection("NoticeAdd");

    // ------------------- Token Verify ------------------
    //verify fb Token
    const verifyToken = async (req, res, next) => {
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith("Bearer ")) {
        return res.status(401).json({ error: "No token provided" });
      }
      const token = authHeader.split(" ")[1];
      try {
        const decoded = await admin.auth().verifyIdToken(token);
        req.decoded = decoded;
        next();
      } catch (err) {
        return res.send(401).send({ message: "unauthorized Access" });
      }
    };
    //verify admin
    const verifyAdmin = async (req, res, next) => {
      const adminEmail = req.decoded.email;

      if (adminEmail) {
        const userFromDb = await branchesCollection.findOne({
          email: adminEmail,
        });
        if (userFromDb.role === "admin") {
          next();
        } else {
          return res
            .status(403)
            .send({ message: "Forbidden: Requires administrator access." });
        }
      }
    };
    //verify member
    const verifyMember = async (req, res, next) => {
      const adminEmail = req.decoded.email;

      if (adminEmail) {
        const userFromDb = await branchesCollection.findOne({
          email: adminEmail,
        });
        if (userFromDb.role === "member") {
          next();
        }
      } else {
        return res
          .status(403)
          .send({ message: "Forbidden: Requires member access." });
      }
    };
    const verifyAdminOrMember = async (req, res, next) => {
      const userFromDb = await getRequestUser(req);
      if (["admin", "member"].includes(userFromDb?.role)) {
        req.userFromDb = userFromDb;
        return next();
      }

      return res.status(403).send({
        message: "Forbidden: Requires admin or member access.",
      });
    };

    const verifyAcceptedMemberOrAdmin = async (req, res, next) => {
      const userFromDb = await getRequestUser(req);
      const isAdmin = userFromDb?.role === "admin";
      const isAcceptedMember =
        userFromDb?.role === "member" && userFromDb?.status === "accepted";

      if (isAdmin || isAcceptedMember) {
        req.userFromDb = userFromDb;
        return next();
      }

      return res.status(403).send({
        message: "Forbidden: Requires accepted member or admin access.",
      });
    };

    // get role

    app.get("/getrole/:email", async (req, res) => {
      try {
        const email = req.params.email;
        // console.log('email-> ',email);
        const query = { email };

        const user = await branchesCollection.findOne(query);
        if (!user) {
          return res.status(404).send({ error: "User not found" });
        }

        res.send(user);
      } catch (err) {
        console.error(err);
        res.status(500).send({ error: "Something went wrong" });
      }
    });

    // ------------------- NoticeAdd -------------------
    //add subject to suggestion
    app.post("/NoticeAdd", async (req, res) => {
      console.log(req.body);
      const { name } = req.body;
      const result = await NoticeAddCollection.insertOne({
        name: name,
      });
      res.send(result);
    });
    app.get("/NoticeAdd", async (req, res) => {
      console.log(req.body);
      const result = await NoticeAddCollection.find().toArray();
      console.log(result);
      res.send(result);
    });
    app.delete("/NoticeAdd/:id", async (req, res) => {
      const id = req.params.id;
      // For MongoDB, you must convert the string id to an ObjectId
      const query = { _id: new ObjectId(id) };
      const result = await NoticeAddCollection.deleteOne(query);
      if (result.deletedCount === 1) {
        res.send({
          success: true,
          message: `Subject with ID ${id} deleted successfully.`,
        });
      } else {
        res.status(404).send({
          success: false,
          message: `Subject with ID ${id} not found.`,
        });
      }
    });

    //json exam questions
    app.post("/bulk", async (req, res) => {
      try {
        const questionsArray = req.body;
        console.log(questionsArray);

        // Mongoose handles the connection and the bulk operation to Atlas
        const insertedDocs = await Question.insertMany(questionsArray, {
          ordered: false, // Recommended for large bulk inserts
        });

        res.status(201).json({
          message: `✅ Successfully inserted ${insertedDocs.length} questions into Atlas.`,
          insertedCount: insertedDocs.length,
        });
      } catch (error) {
        console.log("err", error);
      }
    });
    app.get("/bulk", async (req, res) => {
      try {
        const questions = await Question.find().toArray();
        res.send(questions);
      } catch (error) {
        console.error("Failed to fetch questions:", error);
      }
    });
    app.delete("/bulk", async (req, res) => {
      // Expecting an array of string IDs in the request body: ["id1", "id2", ...]
      const questionIdStrings = req.body;

      if (!Array.isArray(questionIdStrings) || questionIdStrings.length === 0) {
        return res.status(400).json({
          message: "Request body must be a non-empty array of question IDs.",
        });
      }

      try {
        // 🎯 CRITICAL STEP: Convert string IDs to MongoDB ObjectId objects
        const objectIds = questionIdStrings.map((id) => new ObjectId(id));

        // Use the native driver's deleteMany method
        const result = await Question.deleteMany({
          _id: { $in: objectIds }, // Use $in with the array of ObjectIds
        });

        // result.deletedCount contains the number of documents successfully removed
        res.status(200).json({
          message: `🗑️ Successfully removed ${result.deletedCount} questions.`,
          deletedCount: result.deletedCount,
        });
      } catch (error) {
        console.error("Bulk delete failed:", error);
        res.status(500).json({
          message: "Server error during bulk deletion.",
          error: error.message,
        });
      }
    });

    // ------------------- ROUTES -------------------
    //add subject to suggestion
    app.post("/subjectAdder", async (req, res) => {
      console.log(req.body);
      const { name } = req.body;
      const result = await subjectSuggestionCollection.insertOne({
        name: name,
      });
      res.send(result);
    });
    app.get("/subjectAdder", async (req, res) => {
      console.log(req.body);
      const result = await subjectSuggestionCollection.find().toArray();
      console.log(result);
      res.send(result);
    });
    app.delete("/subjectAdder/:id", async (req, res) => {
      const id = req.params.id;
      // For MongoDB, you must convert the string id to an ObjectId
      const query = { _id: new ObjectId(id) };
      const result = await subjectSuggestionCollection.deleteOne(query);

      if (result.deletedCount === 1) {
        res.send({
          success: true,
          message: `Subject with ID ${id} deleted successfully.`,
        });
      } else {
        res.status(404).send({
          success: false,
          message: `Subject with ID ${id} not found.`,
        });
      }
    });
    // ============================================= //
    //*-----------------studentId-------------------//
    // ============================================= //
    app.get("/api/generate-pdf/:studentId", async (req, res) => {
      const { studentId } = req.params;

      let studentData;
      try {
        studentData = await studentsCollection.findOne({
          studentRollNumber: studentId,
        });
        if (!studentData) {
          return res.status(404).send("Student not found.");
        }
      } catch (error) {
        console.error("Error fetching student data:", error);
        return res.status(500).send("Failed to fetch student data.");
      }

      const pdfDoc = await PDFDocument.create();
      const page = pdfDoc.addPage([595, 842]);
      const { width, height } = page.getSize();

      const timesRomanFont = await pdfDoc.embedFont(StandardFonts.TimesRoman);
      const timesRomanBoldFont = await pdfDoc.embedFont(
        StandardFonts.TimesRomanBold,
      );

      const rowColor1 = rgb(0.95, 0.95, 0.95);
      const rowColor2 = rgb(1, 1, 1);
      const tableHeaderColor = rgb(0.9, 0.9, 0.9);
      const black = rgb(0, 0, 0);

      try {
        // === 1. Header Section ===
        const logoUrl = "https://i.ibb.co.com/Q79wTLZz/Logo-01.png";
        const studentPhotoUrl = studentData.picture;
        const signatureUrl =
          "https://i.ibb.co.com/LwHVtnr/979-01-removebg-preview.png";

        const [logoResponse, studentPhotoResponse, signatureResponse] =
          await Promise.all([
            axios.get(logoUrl, { responseType: "arraybuffer" }),
            axios.get(studentPhotoUrl, { responseType: "arraybuffer" }),
            axios.get(signatureUrl, { responseType: "arraybuffer" }),
          ]);

        const embedImage = async (bytes, contentType) => {
          if (contentType.includes("jpeg") || contentType.includes("jpg")) {
            return pdfDoc.embedJpg(bytes);
          } else if (contentType.includes("png")) {
            return pdfDoc.embedPng(bytes);
          } else {
            throw new Error(`Unsupported image format: ${contentType}`);
          }
        };

        const logoImage = await embedImage(
          logoResponse.data,
          logoResponse.headers["content-type"],
        );
        const studentPhoto = await embedImage(
          studentPhotoResponse.data,
          studentPhotoResponse.headers["content-type"],
        );
        const signatureImage = await embedImage(
          signatureResponse.data,
          signatureResponse.headers["content-type"],
        );
     page.drawImage(logoImage, {
          x: 40,
          y: height - 150,
          width: 103,
          height: 100,
        });
        page.drawImage(studentPhoto, {
          x: width - 140,
          y: height - 150,
          width: 90,
          height: 100,
        });




        const headerY = height - 70;
        const headerX = width / 2;
        // page.drawText(
        //   "  Approved by Govt. of The People's Republic of Bangladesh",
        //   {
        //     x: headerX - 140,
        //     y: headerY,
        //     size: 8,
        //     font: timesRomanBoldFont,
        //   },
        // );
        // page.drawText("  Bangladesh National Technical Education Institute", {
        //   x: headerX - 140,
        //   y: headerY - 20,
        //   size: 11,
        //   font: timesRomanBoldFont,
        // });
         page.drawText("Government of the People's Republic of Bangladesh", {
          x: headerX - 130,
          y: headerY,
          size: 11,
          font: timesRomanFont,
        });
        page.drawText(" Bangladesh National Technical Education Institute", {
          x: headerX - 140,
          y: headerY - 20,
          size: 12,
          font: timesRomanBoldFont,
        });
        page.drawText(`website: www.bntei.com`, {
          x: headerX - 55,
          y: headerY - 40,
          size: 10,
          font: timesRomanFont,
        });
        page.drawText(`Govt. Reg No: C-198385`, {
          x: headerX - 50,
          y: headerY - 50,
          size: 9,
          font: timesRomanFont,
        });

        // === 2. Result Sheet Title ===
        const titleY = height - 170;
        page.drawText("RESULT SHEET", {
          x: width / 2 - 60,
          y: titleY + 5,
          size: 14,
          font: timesRomanBoldFont,
        });

        // === 3. Student Details Table ===
        const tableX = 40;
        const tableWidth = 515;
        const detailsTableY = titleY - 5;
        let currentY = detailsTableY;
        const rowHeight = 20;
        const column1Width = 230;
        const column2X = tableX + column1Width;
        const padding = 5;

        const details = [
          ["Name of Student", studentData.studentName],
          ["Father's Name", studentData.fatherName],
          ["Mother's Name", studentData.motherName],
          ["Date of Birth", studentData.dob],
          ["Institute Name", studentData.institute],
          ["Institute Code", studentData.branchId],
          ["Roll", studentData.studentRollNumber],
          ["Registration No", studentData.studentRegistrationNumber],
          ["Student Type", "Regular"],
          ["Course Duration", studentData.duration],
          ["Session", studentData.session],
          ["Course Name", studentData.searchCourse],
          ["CGPA Result", studentData.cgpa],
        ];

        details.forEach((row, index) => {
          const rowY = currentY - rowHeight;
          const isEvenRow = index % 2 === 0;

          page.drawRectangle({
            x: tableX,
            y: rowY,
            width: tableWidth,
            height: rowHeight,
            color: isEvenRow ? rgb(0.9, 0.9, 0.9) : rgb(1, 1, 1),
            borderColor: black,
            borderWidth: 1,
          });

          page.drawLine({
            start: { x: tableX + column1Width, y: rowY },
            end: { x: tableX + column1Width, y: rowY + rowHeight },
            color: black,
            thickness: 1,
          });

          page.drawText(row[0], {
            x: tableX + padding,
            y: rowY + padding,
            size: 12,
            font: timesRomanBoldFont,
          });
          page.drawText(row[1], {
            x: column2X + padding,
            y: rowY + padding,
            size: 12,
            font: timesRomanFont,
          });
          currentY -= rowHeight;
        });

        page.drawLine({
          start: { x: tableX, y: detailsTableY },
          end: { x: tableX + tableWidth, y: detailsTableY },
          color: black,
          thickness: 1,
        });
        page.drawLine({
          start: { x: tableX, y: currentY },
          end: { x: tableX, y: detailsTableY },
          color: black,
          thickness: 1,
        });
        page.drawLine({
          start: { x: tableX + tableWidth, y: currentY },
          end: { x: tableX + tableWidth, y: detailsTableY },
          color: black,
          thickness: 1,
        });

        // === 4. Semester-wise Results Table (Conditional) ===
        const hasAcademicMarks = studentData?.academicRecords?.some(
          (record) => record.mark !== "",
        );

        if (hasAcademicMarks) {
          currentY -= 15;
          page.drawText("Semester Wise Results", {
            x: width / 2 - 60,
            y: currentY - 10,
            size: 14,
            font: timesRomanBoldFont,
          });
          currentY -= 20;

          const cellWidth = tableWidth / 3;
          const headers = ["Semester", "Grade", "CGPA"];

          const headerRowY = currentY - rowHeight;
          page.drawRectangle({
            x: tableX,
            y: headerRowY,
            width: tableWidth,
            height: rowHeight,
            color: tableHeaderColor,
            borderColor: black,
            borderWidth: 1,
          });

          headers.forEach((header, i) => {
            const textWidth = timesRomanBoldFont.widthOfTextAtSize(header, 12);
            const textX =
              tableX + i * cellWidth + cellWidth / 2 - textWidth / 2;
            page.drawText(header, {
              x: textX,
              y: headerRowY + padding,
              size: 12,
              font: timesRomanBoldFont,
            });

            if (i < headers.length - 1) {
              page.drawLine({
                start: { x: tableX + (i + 1) * cellWidth, y: headerRowY },
                end: {
                  x: tableX + (i + 1) * cellWidth,
                  y: headerRowY + rowHeight,
                },
                color: black,
                thickness: 1,
              });
            }
          });
          currentY -= rowHeight;

          studentData.academicRecords
            .filter((rec) => rec.mark !== "")
            .forEach((rec, index) => {
              const rowY = currentY - rowHeight;
              const isEvenRow = index % 2 === 0;

              page.drawRectangle({
                x: tableX,
                y: rowY,
                width: tableWidth,
                height: rowHeight,
                color: isEvenRow ? rgb(1, 1, 1) : rgb(0.9, 0.9, 0.9),
                borderColor: black,
                borderWidth: 1,
              });

              const semesterText = rec.semester + " Semester";
              const gradeText = rec.grade;
              const markText = rec.mark;

              const semesterTextWidth = timesRomanFont.widthOfTextAtSize(
                semesterText,
                12,
              );
              const gradeTextWidth = timesRomanFont.widthOfTextAtSize(
                gradeText,
                12,
              );
              const markTextWidth = timesRomanFont.widthOfTextAtSize(
                markText,
                12,
              );

              page.drawText(semesterText, {
                x: tableX + cellWidth / 2 - semesterTextWidth / 2,
                y: rowY + padding,
                size: 12,
                font: timesRomanFont,
              });
              page.drawText(gradeText, {
                x: tableX + cellWidth + cellWidth / 2 - gradeTextWidth / 2,
                y: rowY + padding,
                size: 12,
                font: timesRomanFont,
              });
              page.drawText(markText, {
                x: tableX + 2 * cellWidth + cellWidth / 2 - markTextWidth / 2,
                y: rowY + padding,
                size: 12,
                font: timesRomanFont,
              });

              // Draw vertical lines
              page.drawLine({
                start: { x: tableX + cellWidth, y: rowY },
                end: { x: tableX + cellWidth, y: rowY + rowHeight },
                color: black,
                thickness: 1,
              });
              page.drawLine({
                start: { x: tableX + 2 * cellWidth, y: rowY },
                end: { x: tableX + 2 * cellWidth, y: rowY + rowHeight },
                color: black,
                thickness: 1,
              });

              currentY -= rowHeight;
            });
        }

        // === 5. Course-wise Grade/Marks Table ===
        const finalResultDetails = [
          { label: "Written", value: studentData.writtenMarks ?? "N/A" },
          { label: "Practical", value: studentData.practicalMark ?? "N/A" },
          { label: "Viva", value: studentData.vivaMarks ?? "N/A" },
          { label: "Total", value: studentData.totalMarks ?? "N/A" },
          { label: "Full Mark", value: studentData.fullMark ?? "N/A" },
          { label: "CGPA", value: studentData.cgpa ?? "N/A" },
          { label: "Grade", value: studentData.letterGrade ?? "N/A" },
        ];
        const hasFinalMarks = finalResultDetails.some(
          (detail) => detail.value !== "N/A",
        );

        if (hasFinalMarks) {
          currentY -= 15;
          page.drawText("Course Wise Grade/Marks", {
            x: width / 2 - 70,
            y: currentY - 10,
            size: 14,
            font: timesRomanBoldFont,
          });
          currentY -= 20;

          const courseCellWidth = tableWidth / 7;
          const courseHeaders = [
            "Written",
            "Practical",
            "Viva",
            "Total",
            "Full Mark",
            "CGPA",
            "Grade",
          ];

          const headerRowY = currentY - rowHeight;
          page.drawRectangle({
            x: tableX,
            y: headerRowY,
            width: tableWidth,
            height: rowHeight,
            color: rgb(0.9, 0.9, 0.9),
            borderColor: black,
            borderWidth: 1,
          });

          courseHeaders.forEach((header, i) => {
            const textWidth = timesRomanBoldFont.widthOfTextAtSize(header, 12);
            const textX =
              tableX +
              i * courseCellWidth +
              courseCellWidth / 2 -
              textWidth / 2;
            page.drawText(header, {
              x: textX,
              y: headerRowY + padding,
              size: 12,
              font: timesRomanBoldFont,
            });

            if (i < courseHeaders.length - 1) {
              page.drawLine({
                start: { x: tableX + (i + 1) * courseCellWidth, y: headerRowY },
                end: {
                  x: tableX + (i + 1) * courseCellWidth,
                  y: headerRowY + rowHeight,
                },
                color: black,
                thickness: 1,
              });
            }
          });
          currentY -= rowHeight;

          const dataRowY = currentY - rowHeight;
          page.drawRectangle({
            x: tableX,
            y: dataRowY,
            width: tableWidth,
            height: rowHeight,
            color: rgb(1, 1, 1),
            borderColor: black,
            borderWidth: 1,
          });

          const courseData = [
            String(studentData.writtenMarks || "N/A"),
            String(studentData.practicalMark || "N/A"),
            String(studentData.vivaMarks || "N/A"),
            String(studentData.totalMarks || "N/A"),
            String(studentData.fullMark || "N/A"),
            String(studentData.cgpa || "N/A"),
            String(studentData.letterGrade || "N/A"),
          ];
          courseData.forEach((data, i) => {
            const textWidth = timesRomanFont.widthOfTextAtSize(data, 12);
            const textX =
              tableX +
              i * courseCellWidth +
              courseCellWidth / 2 -
              textWidth / 2;
            page.drawText(data, {
              x: textX,
              y: dataRowY + padding,
              size: 12,
              font: timesRomanFont,
            });

            if (i < courseData.length - 1) {
              page.drawLine({
                start: { x: tableX + (i + 1) * courseCellWidth, y: dataRowY },
                end: {
                  x: tableX + (i + 1) * courseCellWidth,
                  y: dataRowY + rowHeight,
                },
                color: black,
                thickness: 1,
              });
            }
          });
          currentY -= rowHeight;
        }

        // === 6. Signature Section ===
        const signatureX = width - 180;
        const signatureY = 50;

        page.drawImage(signatureImage, {
          x: signatureX,
          y: signatureY,
          width: 100,
          height: 50,
        });
        page.drawText("  Bangladesh National Technical Education Institute", {
          x: signatureX - 70,
          y: signatureY - 20,
          size: 9,
          font: timesRomanBoldFont,
        });
        page.drawText("Controller of Examination", {
          x: signatureX - 20,
          y: signatureY - 10,
          size: 10,
          font: timesRomanBoldFont,
        });

        const pdfBuffer = await pdfDoc.save();
        res.setHeader("Content-Type", "application/pdf");
        res.setHeader(
          "Content-Disposition",
          `attachment; filename=result_${studentId}.pdf`,
        );
        res.send(Buffer.from(pdfBuffer));
      } catch (error) {
        console.error("Error generating PDF:", error);
        res.status(500).send("Error generating PDF.");
      }
    });

    app.post("/allBranches", async (req, res) => {
      try {
        const {
          instituteName,
          directorName,
          fatherName,
          motherName,
          email,
          mobileNumber,
          address,
          postOffice,
          upazila,
          district,
          username,
          password,
          directorPhoto,
          institutePhoto,
          nationalIdPhoto,
          signaturePhoto,
        } = req.body;

        // Use findOneAndUpdate to atomically increment the branch counter
        const branchCounter = await countersCollection.findOneAndUpdate(
          { _id: "branchId" },
          { $inc: { sequence_value: 1 } },
          { returnDocument: "after", upsert: true },
        );

        // Safely get the new branch ID and format it
        const nextBranchId = branchCounter?.sequence_value || 1;
        const newBranchId = nextBranchId.toString().padStart(6, "0");

        const newUserInfo = {
          branchId: newBranchId,
          instituteName,
          directorName,
          fatherName,
          motherName,
          email,
          mobileNumber,
          address,
          postOffice,
          upazila,
          district,
          username,
          password,
          directorPhoto,
          institutePhoto,
          nationalIdPhoto,
          signaturePhoto,
          status: "pending",
        };

        console.log(newUserInfo);
        const result = await branchesCollection.insertOne(newUserInfo);

        res.status(201).json({
          message: "User information added successfully",
          insertedId: result.insertedId,
          branchId: newBranchId,
        });
      } catch (error) {
        console.error("Error adding user info:", error);
        res.status(500).json({
          message:
            "An error occurred while adding user information from registration form",
          error: error.message,
        });
      }
    });
    //  Update branch
    app.put("/selectedBranch/:id", async (req, res) => {
      try {
        const id = req.params.id;
        const updatedData = req.body;

        await branchesCollection.updateOne(
          { _id: new ObjectId(id) },
          { $set: updatedData },
        );

        res.send({ success: true, message: "Branch updated successfully" });
      } catch (error) {
        console.error("Error updating branch:", error);
        res.status(500).send({ error: "Failed to update branch" });
      }
    });
    app.delete("/StudentsList/:studentId", async (req, res) => {
      try {
        const mongoId = req.params.studentId;
        const result = await studentsCollection.deleteOne({
          _id: new ObjectId(mongoId),
        });

        if (result.deletedCount === 0) {
          return res.status(404).send({ error: "Student not found" });
        }

        res.send({ success: true, message: "Student deleted successfully" });
      } catch (err) {
        console.error(err);
        res.status(500).send({ error: "Failed to delete student" });
      }
    });

    //  Delete branch
    app.delete("/allBranches/:id", async (req, res) => {
      try {
        const id = req.params.id;
        await branchesCollection.deleteOne({ _id: new ObjectId(id) });

        res.send({ success: true, message: "Branch deleted successfully" });
      } catch (error) {
        console.error("Error deleting branch:", error);
        res.status(500).send({ error: "Failed to delete branch" });
      }
    });
    app.put(
      "/allBranches/:id",
      upload.fields([
        { name: "directorPhoto" },
        { name: "institutePhoto" },
        { name: "nationalIdPhoto" },
        { name: "signaturePhoto" },
      ]),
      async (req, res) => {
        const { id } = req.params;

        try {
          const updateData = { ...req.body };

          if (req.files) {
            Object.keys(req.files).forEach((key) => {
              const file = req.files[key][0];
              updateData[key] = `data:${
                file.mimetype
              };base64,${file.buffer.toString("base64")}`;
            });
          }

          // Update in MongoDB
          const result = await branchesCollection.updateOne(
            { _id: new ObjectId(id) },
            { $set: updateData },
          );

          if (result.matchedCount === 0) {
            return res
              .status(404)
              .send({ success: false, message: "Branch not found" });
          }

          res.send({ success: true, result });
        } catch (err) {
          console.error("Update Error:", err);
          res.status(500).send({ success: false, error: err.message });
        }
      },
    );

    //get all requested branches info from db to show in admin approval section
    app.get("/allBranches", async (req, res) => {
      const result = await branchesCollection.find().toArray();
      res.send(result);
    });
    //get all course data from db
    app.get("/allCourses", async (req, res) => {
      const result = await coursesCollection.find().toArray();
      res.send(result);
    });
    // delete one specific course from all courses in db
    app.delete("/deleteCourse/:id", async (req, res) => {
      const courseId = req.params.id;
      const result = await coursesCollection.deleteOne({
        _id: new ObjectId(courseId),
      });
      res.status(200).send({ message: "Course deleted successfully.", result });
    });
    //get the total number of courses from db
    app.get("/numberOfCourses", async (req, res) => {
      const count = await coursesCollection.estimatedDocumentCount();
      res.send({ count });
    });
    // get currently logged in user info
    app.get("/currentUserInfo", async (req, res) => {
      const userEmail = req.query.email;
      console.log(userEmail);
      try {
        const currentUserData = await branchesCollection.findOne({
          email: userEmail,
        });

        const data = { currentUserData };
        if (currentUserData) {
          res.status(200).send(data);
        } else {
          res.status(200).send({});
        }
      } catch (error) {
        console.error("Error fetching user agreement:", error);
        res
          .status(500)
          .send({ message: "Server error fetching user agreement." });
      }
    });
    app.post("/pendingBranch", async (req, res) => {
      const approvedBranchEmail = req.query.email;
      const result = await branchesCollection.updateOne(
        { email: approvedBranchEmail },
        { $set: { status: "pending" } },
      );
      res.send(result);
    });
    //upload image to imageBB (DO NOT TOUCH)
    app.post("/upload-to-imgbb", upload.single("image"), async (req, res) => {
      try {
        const apiKey = process.env.IMGBB_API_KEY;
        if (!apiKey) {
          return res
            .status(500)
            .json({ error: "ImageBB API key is not configured." });
        }

        const file = req.file;
        if (!file) {
          return res.status(400).json({ error: "No image file provided." });
        }
        const formData = new FormData();
        formData.append("image", file.buffer, { filename: file.originalname });
        const imgbbResponse = await axios.post(
          `https://api.imgbb.com/1/upload?key=${apiKey}`,
          formData,
          {
            headers: {
              ...formData.getHeaders(),
            },
          },
        );

        const imageUrl = imgbbResponse.data.data.url;
        res.status(200).json({ imageUrl });
      } catch (error) {
        res
          .status(500)
          .json({ error: "Failed to upload image. Please try again later." });
      }
    });
    //add course to the all course in db
    app.post("/addCourse", async (req, res) => {
      const courseData = req.body;
      console.log(courseData);
      const result = await coursesCollection.insertOne(courseData);
      res
        .status(201)
        .json({ message: "Course added successfully!", course: result });
    });
    //handle approve request from admin for branch approval
    app.post("/approveBranch", async (req, res) => {
      const approvedBranchEmail = req.query.email;
      const result = await branchesCollection.updateOne(
        { email: approvedBranchEmail },
        { $set: { status: "accepted" } },
      );
      res.send(result);
    });
    //handle approve request from admin for branch approval
    app.post("/rejectBranch", async (req, res) => {
      const rejectedBranchEmail = req.query.email;
      const result = await branchesCollection.updateOne(
        { email: rejectedBranchEmail },
        { $set: { status: "rejected" } },
      );
      res.send(result);
    });

    // ============================================= //
    //------------------OMRSheet-------------------//
    // ============================================= //
    // POST
    app.post("/api/OMRSheet", async (req, res) => {
      try {
        const data = req.body;
        const result = await OMRSheetCollection().insertOne(data);
        res.status(201).json({ success: true, id: result.insertedId });
      } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, error: err.message });
      }
    });

    // GET
    app.get("/api/OMRSheet", async (req, res) => {
      try {
        const OMRSheets = await OMRSheetCollection().find({}).toArray();
        res.status(200).json({ success: true, data: OMRSheets });
      } catch (err) {
        res.status(500).json({ success: false, error: err.message });
      }
    });
    app.delete("/api/OMRSheet/:id", async (req, res) => {
      const { id } = req.params;
      if (!id || id.length !== 24) {
        return res
          .status(400)
          .json({ success: false, error: "Invalid ID format" });
      }
      try {
        const collection = OMRSheetCollection();
        const objectId = new ObjectId(id);
        console.log(`Attempting to delete ID: ${objectId}.`);
        const result = await collection.deleteOne({ _id: objectId });
        if (result.deletedCount === 1) {
          res.json({ success: true, message: "Notice deleted successfully" });
        } else {
          res.status(404).json({ success: false, error: "Notice not found" });
        }
      } catch (err) {
        console.error("Error in DELETE for ID:", id, ":", err);
        res.status(500).json({
          success: false,
          error: "Server error or invalid ObjectId provided",
        });
      }
      // ===== done
    });

    // ============================================= //
    //-------------AdminMessageOMRSheet-------------//
    // ============================================= //
    // POST
    app.post("/api/AdminMessageOMRSheet", async (req, res) => {
      try {
        const data = req.body;
        const result = await AdminMessageOMRSheetCollection().insertOne(data);
        res.status(201).json({ success: true, id: result.insertedId });
      } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, error: err.message });
      }
    });
    // GET
    app.get("/api/AdminMessageOMRSheet", async (req, res) => {
      try {
        const AdminMessageOMRSheet = await AdminMessageOMRSheetCollection()
          .find({})
          .toArray();
        res.status(200).json({ success: true, data: AdminMessageOMRSheet });
      } catch (err) {
        res.status(500).json({ success: false, error: err.message });
      }
    });

    app.delete("/api/AdminMessageOMRSheet/:id", async (req, res) => {
      const { id } = req.params;

      if (!id || id.length !== 24) {
        return res
          .status(400)
          .json({ success: false, error: "Invalid ID format" });
      }

      try {
        const collection = AdminMessageOMRSheetCollection();

        // ObjectId তৈরি করুন
        const objectId = new ObjectId(id);

        console.log(
          `[DELETE DEBUG] Attempting to delete AdminMessageOMRSheet ID: ${objectId}.`,
        );

        const result = await collection.deleteOne({ _id: objectId });

        if (result.deletedCount === 1) {
          console.log(
            `[DELETE SUCCESS] AdminMessageOMRSheet with ID ${objectId} deleted.`,
          );

          res
            .status(200)
            .json({ success: true, message: "Sheet deleted successfully" });
        } else {
          console.warn(
            `[DELETE FAILURE] Sheet with ID ${objectId} not found in collection.`,
          );
          res.status(404).json({ success: false, error: "Notice not found" });
        }
      } catch (err) {
        console.error("Error in DELETE for ID:", id, ":", err);
        res.status(500).json({
          success: false,
          error: "Server error or invalid ObjectId provided",
        });
      }
    });

    // ===== done
    // ============================================= //
    //-------------------noticeboardyourpdf-----------------//
    // ============================================= //
    // POST
    app.post("/api/noticeboardyourpdf", async (req, res) => {
      try {
        const data = req.body;
        const result = await noticeboardyourpdfCollection().insertOne(data);
        res.status(201).json({ success: true, id: result.insertedId });
      } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, error: err.message });
      }
    });
    // GET
    app.get("/api/noticeboardyourpdf", async (req, res) => {
      try {
        const noticeboardyourpdf = await noticeboardyourpdfCollection()
          .find({})
          .toArray();
        res.status(200).json({ success: true, data: noticeboardyourpdf });
      } catch (err) {
        res.status(500).json({ success: false, error: err.message });
      }
    });

    app.delete("/api/noticeboardyourpdf/:id", async (req, res) => {
      const { id } = req.params;

      if (!id || id.length !== 24) {
        return res
          .status(400)
          .json({ success: false, error: "Invalid ID format" });
      }

      try {
        const collection = noticeboardyourpdfCollection();

        const objectId = new ObjectId(id);

        console.log(`Attempting to delete ID: ${objectId}.`);

        const result = await collection.deleteOne({ _id: objectId });

        if (result.deletedCount === 1) {
          res.json({ success: true, message: "Notice deleted successfully" });
        } else {
          res.status(404).json({ success: false, error: "Notice not found" });
        }
      } catch (err) {
        console.error("Error in DELETE for ID:", id, ":", err);
        res.status(500).json({
          success: false,
          error: "Server error or invalid ObjectId provided",
        });
      }
    });

    // ============================================= //
    //-------------------AllTable-----------------//
    // ============================================= //
    // POST
    app.post("/api/AllTable", async (req, res) => {
      try {
        const data = req.body;
        const result = await AllTableCollection().insertOne(data);
        res.status(201).json({ success: true, id: result.insertedId });
      } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, error: err.message });
      }
    });
    // GET
    app.get("/api/AllTable", async (req, res) => {
      try {
        const AllTable = await AllTableCollection().find({}).toArray();
        res.status(200).json({ success: true, data: AllTable });
      } catch (err) {
        res.status(500).json({ success: false, error: err.message });
      }
    });
    app.delete("/api/AllTable/:id", async (req, res) => {
      const { id } = req.params;
      if (!id || id.length !== 24) {
        return res
          .status(400)
          .json({ success: false, error: "Invalid ID format" });
      }
      try {
        const collection = AllTableCollection();
        const objectId = new ObjectId(id);
        console.log(`Attempting to delete ID: ${objectId}.`);
        const result = await collection.deleteOne({ _id: objectId });
        if (result.deletedCount === 1) {
          res.json({ success: true, message: "Notice deleted successfully" });
        } else {
          res.status(404).json({ success: false, error: "Notice not found" });
        }
      } catch (err) {
        console.error("Error in DELETE for ID:", id, ":", err);
        res.status(500).json({
          success: false,
          error: "Server error or invalid ObjectId provided",
        });
      }
      // ===== done
    });

    // ============================================= //
    //------------------OnlineExamPageAddAdmin-------//
    // ============================================= //
    // POST
    app.post("/OnlineExamPageAddAdmin", async (req, res) => {
      try {
        const data = req.body;
        const result = await OnlineExamPageAddAdminCollection().insertOne(data);
        res.status(201).json({ success: true, id: result.insertedId });
      } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, error: err.message });
      }
    });
    // GET
    app.get("/OnlineExamPageAddAdmin", async (req, res) => {
      try {
        const OMRSheets = await OnlineExamPageAddAdminCollection()
          .find({})
          .toArray();
        res.status(200).json({ success: true, data: OMRSheets });
      } catch (err) {
        res.status(500).json({ success: false, error: err.message });
      }
    });
    // ===== done

    // ============================================= //
    //------------------ExamSuggestion-------------------//
    // ============================================= //
    // POST
    app.post("/api/ExamSuggestion", async (req, res) => {
      try {
        const data = req.body;
        const result = await ExamSuggestionCollection().insertOne(data);
        res.status(201).json({ success: true, id: result.insertedId });
      } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, error: err.message });
      }
    });
    // GET
    app.get("/api/ExamSuggestion", async (req, res) => {
      try {
        const ExamSuggestion = await ExamSuggestionCollection()
          .find({})
          .toArray();
        res.status(200).json({ success: true, data: ExamSuggestion });
      } catch (err) {
        res.status(500).json({ success: false, error: err.message });
      }
    });
    app.delete("/api/ExamSuggestion/:id", async (req, res) => {
      const { id } = req.params;
      if (!id || id.length !== 24) {
        return res
          .status(400)
          .json({ success: false, error: "Invalid ID format" });
      }
      try {
        const collection = ExamSuggestionCollection();
        // ObjectId তৈরি করুন
        const objectId = new ObjectId(id);
        console.log(
          `[DELETE DEBUG] Attempting to delete ExamSuggestion ID: ${objectId}.`,
        );
        const result = await collection.deleteOne({ _id: objectId });
        if (result.deletedCount === 1) {
          console.log(
            `[DELETE SUCCESS] ExamSuggestion with ID ${objectId} deleted.`,
          );
          res
            .status(200)
            .json({ success: true, message: "Sheet deleted successfully" });
        } else {
          console.warn(
            `[DELETE FAILURE] Sheet with ID ${objectId} not found in collection.`,
          );
          res.status(404).json({ success: false, error: "Notice not found" });
        }
      } catch (err) {
        console.error("Error in DELETE for ID:", id, ":", err);
        res.status(500).json({
          success: false,
          error: "Server error or invalid ObjectId provided",
        });
      }
    });
    // ===== done

    app.patch("/StudentsList/:id", async (req, res) => {
      try {
        const id = req.params.id;
        const clientPayload = req.body;
        console.log(clientPayload);

        let update;

        // --- CRITICAL FIX START ---
        // Check if the payload contains a MongoDB operator (like $set or $unset)
        const isOperatorUpdate = Object.keys(clientPayload)[0]?.startsWith("$");

        if (isOperatorUpdate) {
          // If it's $set or $unset, use the payload directly as the update document
          update = clientPayload;
        } else {
          // If it's a standard object (e.g., {name: "New Name"}), wrap it in $set
          update = {
            $set: clientPayload,
          };
        }
        // --- CRITICAL FIX END ---

        const result = await studentsCollection.updateOne(
          { _id: new ObjectId(id) },
          update,
        );

        if (result.matchedCount === 0) {
          // Check matchedCount first
          return res.status(404).json({
            success: false,
            message: "Student not found.",
          });
        }

        if (result.modifiedCount === 0) {
          return res.status(200).json({
            // Return 200 if matched but not modified (no change needed)
            success: true,
            message: "Student found, but no changes were made.",
          });
        }

        console.log(`Updated student with id: ${id}`, update);
        res
          .status(200)
          .json({ success: true, message: "Student updated successfully!" });
      } catch (error) {
        console.error(" Error updating student:", error);
        res
          .status(500)
          .json({ success: false, error: "Failed to update student" });
      }
    });
    app.delete("/StudentsList/:id", async (req, res) => {
      try {
        const id = req.params.id;
        const result = await studentsCollection.deleteOne({
          _id: new ObjectId(id),
        });

        if (result.deletedCount === 0) {
          return res
            .status(404)
            .json({ success: false, message: "Student not found." });
        }

        console.log(`Deleted student with id: ${id}`);
        res
          .status(200)
          .json({ success: true, message: "Student deleted successfully!" });
      } catch (error) {
        console.error(" Error deleting student:", error);
        res
          .status(500)
          .json({ success: false, error: "Failed to delete student" });
      }
    });
    //student search for result
    app.get("/studentResult/:studentId", async (req, res) => {
      try {
        const { studentId } = req.params;
        console.log(studentId);

        // Use findOne to find the student by their unique studentId
        const student = await studentsCollection.findOne({
          studentRollNumber: studentId,
        });

        if (!student) {
          return res.status(404).json({ message: "Student not found" });
        }

        res.send(student);
      } catch (error) {
        console.error("Error fetching student details:", error);
        res.status(500).json({ message: "Internal Server Error" });
      }
    });

    /**
     * ==============================
     *   OnlineExam Routes
     * ==============================
     */

    app.post("/OnlineExam", async (req, res) => {
      try {
        const { title, subject, duration } = req.body;
        const result = await db.collection("OnlineExam").insertOne({
          title,
          subject,
          duration,
          createdAt: new Date(),
        });
        res.json({ success: true, id: result.insertedId });
      } catch (err) {
        res.status(500).json({ error: "Failed to create exam" });
      }
    });

    /**
     * Exam list পাওয়া
     */
    app.get("/OnlineExam", async (req, res) => {
      try {
        const exams = await db.collection("OnlineExam").find().toArray();
        res.json(exams);
      } catch (err) {
        res.status(500).json({ error: "Failed to fetch exams" });
      }
    });

    // *********----StudentsList-----*********
    app.post("/StudentsList", upload.single("picture"), async (req, res) => {
      const body = req.body || {};

      try {
        // Safely get and increment the studentId counter
        const studentIdCounter = await countersCollection.findOneAndUpdate(
          { _id: "studentId" },
          { $inc: { sequence_value: 1 } },
          { returnDocument: "after", upsert: true },
        );
        // Use optional chaining to prevent the error
        console.log(studentIdCounter);
        const nextStudentId = studentIdCounter?.sequence_value || 1;
        const newStudentId = nextStudentId.toString().padStart(6, "0");

        // Safely get and increment the studentRegistrationNumber counter
        const registrationNumberCounter =
          await countersCollection.findOneAndUpdate(
            { _id: "studentRegistrationNumber" },
            { $inc: { sequence_value: 1 } },
            { returnDocument: "after", upsert: true },
          );
        const nextRegistrationNumber =
          registrationNumberCounter?.sequence_value || 1;
        const newStudentRegistrationNumber = (nextRegistrationNumber + 50000000)
          .toString()
          .padStart(8, "0");

        // Safely get and increment the studentRollNumber counter
        const rollNumberCounter = await countersCollection.findOneAndUpdate(
          { _id: "studentRollNumber" },
          { $inc: { sequence_value: 1 } },
          { returnDocument: "after", upsert: true },
        );
        const nextRollNumber = rollNumberCounter?.sequence_value || 1;
        const newStudentRollNumber = (nextRollNumber + 900000)
          .toString()
          .padStart(6, "0");

        // ... rest of your code to insert the student
        const sessionString = `${body.month1} ${body.year1} - ${body.month2} ${body.year2}`;

        const studentDoc = {
          branchId: body.branchId,
          studentId: newStudentId,
          studentRegistrationNumber: newStudentRegistrationNumber,
          studentRollNumber: newStudentRollNumber,
          studentName: body.studentName || "",
          fatherName: body.fatherName || "",
          motherName: body.motherName || "",
          dob: body.dob || "",
          gender: body.gender || "",
          passport: body.passport || "",
          guardianPhone: body.guardianPhone || "",
          studentAddress: body.studentAddress || "",
          district: body.district || "",
          thana: body.thana || "",
          searchCourse: body.searchCourse || "",
          duration: body.duration || "",
          session: sessionString,
          educationQualification: body.educationQualification || "",
          institute: body.institute || "",
          issueDate: body.issueDate || "",
          expireDate: body.expireDate || "",
          directorName: body.directorName || "",
          createdAt: new Date(),
          picture: body.picture,
        };

        console.log(studentDoc);
        const result = await studentsCollection.insertOne(studentDoc);
        console.log("Inserted student:", result.insertedId);

        res.status(201).json({ success: true, insertedId: result.insertedId });
      } catch (error) {
        console.error("Error inserting student:", error);
        res.status(500).json({
          success: false,
          message: "Failed to create student record.",
        });
      }
    });
    app.post(
      "/StudentsListAdmin",
      upload.single("picture"),
      async (req, res) => {
        const body = req.body || {};

        try {
          // Safely get and increment the studentId counter
          const studentIdCounter = await countersCollection.findOneAndUpdate(
            { _id: "studentId" },
            { $inc: { sequence_value: 1 } },
            { returnDocument: "after", upsert: true },
          );
          // Use optional chaining to prevent the error
          console.log(studentIdCounter);
          const nextStudentId = studentIdCounter?.sequence_value || 1;
          const newStudentId = nextStudentId.toString().padStart(6, "0");

          // Safely get and increment the studentRegistrationNumber counter
          const registrationNumberCounter =
            await countersCollection.findOneAndUpdate(
              { _id: "studentRegistrationNumber" },
              { $inc: { sequence_value: 1 } },
              { returnDocument: "after", upsert: true },
            );
          const nextRegistrationNumber =
            registrationNumberCounter?.sequence_value || 1;
          const newStudentRegistrationNumber = (
            nextRegistrationNumber + 50000000
          )
            .toString()
            .padStart(8, "0");

          // Safely get and increment the studentRollNumber counter
          const rollNumberCounter = await countersCollection.findOneAndUpdate(
            { _id: "studentRollNumber" },
            { $inc: { sequence_value: 1 } },
            { returnDocument: "after", upsert: true },
          );
          const nextRollNumber = rollNumberCounter?.sequence_value || 1;
          const newStudentRollNumber = (nextRollNumber + 900000)
            .toString()
            .padStart(6, "0");

          // ... rest of your code to insert the student
          const sessionString = `${body.month1} ${body.year1} - ${body.month2} ${body.year2}`;

          const studentDoc = {
            branchId: body.branchId,
            studentId: newStudentId,
            studentRegistrationNumber: newStudentRegistrationNumber,
            studentRollNumber: newStudentRollNumber,
            studentName: body.studentName || "",
            fatherName: body.fatherName || "",
            motherName: body.motherName || "",
            dob: body.dob || "",
            gender: body.gender || "",
            passport: body.passport || "",
            guardianPhone: body.guardianPhone || "",
            studentAddress: body.studentAddress || "",
            district: body.district || "",
            thana: body.thana || "",
            searchCourse: body.searchCourse || "",
            duration: body.duration || "",
            session: sessionString,
            educationQualification: body.educationQualification || "",
            institute: body.institute || "",
            issueDate: body.issueDate || "",
            expireDate: body.expireDate || "",
            directorName: body.directorName || "",
            createdAt: new Date(),
            picture: body.picture,
          };

          console.log(studentDoc);
          const result = await studentsCollection.insertOne(studentDoc);
          console.log("Inserted student:", result.insertedId);

          res
            .status(201)
            .json({ success: true, insertedId: result.insertedId });
        } catch (error) {
          console.error("Error inserting student:", error);
          res.status(500).json({
            success: false,
            message: "Failed to create student record.",
          });
        }
      },
    );
    // GET - Get all students
    app.get("/StudentsList", async (req, res) => {
      try {
        const items = await studentsCollection
          .find()
          .sort({ createdAt: -1 })
          .toArray();

        if (items.length === 0) {
          return res
            .status(404)
            .json({ success: false, message: "No students found." });
        }

        res.json(items);
      } catch (error) {
        console.error(" Fetch students error:", error);
        res
          .status(500)
          .json({ success: false, error: "Failed to fetch students" });
      }
    });

    // ********image api********
    app.post("/users", async (req, res) => {
      const { name, images } = req.body;
      // name: "Robin"
      // images: ["url1", "url2", "url3", "url4"]
      const result = await userCollection.insertOne({ name, images });
      res.send(result);
    });

    app.post("/StudentsList", async (req, res) => {
      try {
        const { name, images } = req.body;

        if (!name || !images) {
          return res.status(400).send({ error: "Name and image are required" });
        }

        const result = await studentCollection.insertOne({ name, images });
        res.status(201).send({ success: true, insertedId: result.insertedId });
      } catch (error) {
        console.error(" Error inserting student:", error);
        res.status(500).send({ error: "Failed to insert student" });
      }
    });
    ////new added
    // get spesic student data
    app.get("/StudentsList/:id", async (req, res) => {
      const id = req.params.id;

      const query = { _id: new ObjectId(id) };

      const student = await studentsCollection.findOne(query);
      res.send(student);
    });

    // update subject data

    app.patch("/StudentsList/:id", async (req, res) => {
      try {
        const id = req.params.id;
        const { subjects } = req.body; // Array of {subject, semester, cgpa, grade}

        if (!subjects || !Array.isArray(subjects)) {
          return res.status(400).json({
            success: false,
            message: "Subjects array is required",
          });
        }
      } catch (error) {
        console.error(error);
        res
          .status(500)
          .json({ success: false, message: "Failed to add footer info." });
      }
    });

    // ===========================
    // Route 1: Add footer info
    // ===========================
    app.post("/footer", async (req, res) => {
      try {
        const footerData = req.body;
        const result = await footerCollection.insertOne(footerData);
        res.json({
          success: true,
          message: "Footer info added!",
          data: result,
        });
      } catch (error) {
        console.error(error);
        res
          .status(500)
          .json({ success: false, message: "Failed to add footer info." });
      }
    });
    app.delete("/footer/:id", verifyToken, verifyAdmin, async (req, res) => {
      try {
        const id = req.params.id;
        const result = await footerCollection.deleteOne({
          _id: new ObjectId(id),
        });
        if (result.deletedCount === 1) {
          res.json({ success: true, message: "Footer deleted!" });
        } else {
          res.json({ success: false, message: "Footer not found." });
        }
      } catch (err) {
        console.error(err);
        res
          .status(500)
          .json({ success: false, message: "Failed to delete footer." });
      }
    });
    //  Update footer
    app.put("/footer/:id", verifyToken, verifyAdmin, async (req, res) => {
      try {
        const { id } = req.params;
        const updateData = req.body;

        // _id field remove করা লাগবে
        if (updateData._id) delete updateData._id;

        const result = await footerCollection.updateOne(
          { _id: new ObjectId(id) },
          { $set: updateData },
        );

        if (result.modifiedCount > 0) {
          res.json({ success: true, message: "Footer updated" });
        } else {
          res.json({ success: false, message: "No changes made" });
        }
      } catch (err) {
        res.json({ success: false, message: err.message });
      }
    });

    // ===========================
    // Route 2: Get footer info
    // ===========================
    app.get("/footer", verifyToken, verifyAdmin, async (req, res) => {
      try {
        const footer = await footerCollection.findOne({});
        res.json({ success: true, data: footer });
      } catch (error) {
        console.error(error);
        res
          .status(500)
          .json({ success: false, message: "Failed to fetch footer info." });
      }
    });

    // Get all cards
    app.get("/cards", async (req, res) => {
      const cards = await cardsCollection.find().toArray();
      res.send(cards);
    });

    //  Add new card
    app.post("/cards", verifyToken, verifyAdmin, async (req, res) => {
      const result = await cardsCollection.insertOne(req.body);
      res.send(result);
    });

    app.put("/cards/:id", verifyToken, verifyAdmin, async (req, res) => {
      try {
        const { id } = req.params;
        const { name, title, image, items } = req.body;

        const updateDoc = {
          $set: { name, title, items },
        };

        if (image) {
          updateDoc.$set.image = image;
        }

        const result = await cards.updateOne(
          { _id: new ObjectId(id) },
          updateDoc,
        );

        if (result.matchedCount === 0) {
          return res.status(404).json({ error: "Card not found" });
        }

        res.json({ success: true, modifiedCount: result.modifiedCount });
      } catch (err) {
        res.status(500).json({ error: "Failed to update card" });
      }
    });

    //  Delete card
    app.delete("/cards/:id", verifyToken, verifyAdmin, async (req, res) => {
      const { id } = req.params;
      const result = await cardsCollection.deleteOne({ _id: new ObjectId(id) });
      res.send(result);
    });

    // Get all success students
    app.get("/successStudents", async (req, res) => {
      const students = await successStudentsCollection.find().toArray();
      res.send(students);
    });
    app.get("/AllStudents", async (req, res) => {
      const students = await studentsCollection.find().toArray();
      res.send(students);
    });

    // Add new success student
    app.post("/successStudents", verifyToken, verifyAdmin, async (req, res) => {
      const result = await successStudentsCollection.insertOne(req.body);
      res.send(result);
    });

    // Update success student
    app.put(
      "/successStudents/:id",
      verifyToken,
      verifyAdmin,
      async (req, res) => {
        const { id } = req.params;
        const result = await successStudentsCollection.updateOne(
          { _id: new ObjectId(id) },
          { $set: req.body },
        );
        res.send(result);
      },
    );

    // Delete success student
    app.delete(
      "/successStudents/:id",
      verifyToken,
      verifyAdmin,
      async (req, res) => {
        const { id } = req.params;
        const result = await successStudentsCollection.deleteOne({
          _id: new ObjectId(id),
        });
        res.send(result);
      },
    );

    // Assuming you already have:
    // const { MongoClient, ObjectId } = require("mongodb");
    // const client = new MongoClient(MONGO_URI);
    // let db;
    // await client.connect();
    // db = client.db("YOUR_DB_NAME");

    // Get all success students
    app.get("/InfoCard", async (req, res) => {
      const students = await InfoCardCollection.find().toArray();
      res.send(students);
    });

    // Add new success student
    app.post("/InfoCard", verifyToken, verifyAdmin, async (req, res) => {
      const result = await InfoCardCollection.insertOne(req.body);
      res.send(result);
    });

    // Update success student
    app.put("/InfoCard/:id", verifyToken, verifyAdmin, async (req, res) => {
      const { id } = req.params;
      const result = await InfoCardCollection.updateOne(
        { _id: new ObjectId(id) },
        { $set: req.body },
      );
      res.send(result);
    });

    // Delete success student
    app.delete("/InfoCard/:id", verifyToken, verifyAdmin, async (req, res) => {
      const { id } = req.params;
      const result = await InfoCardCollection.deleteOne({
        _id: new ObjectId(id),
      });
      res.send(result);
    });

    //  slider
    app.get("/homeSlider", async (req, res) => {
      const sliders = await homeSliderCollection.find().toArray();
      res.send(sliders);
    });

    // slider
    app.post("/homeSlider",async (req, res) => {
      const { src, alt, legend } = req.body;
      const result = await homeSliderCollection.insertOne({ src, alt, legend });
      res.send(result);
    });

    //  slider
    app.delete(
      "/homeSlider/:id",
    
      async (req, res) => {
        const { id } = req.params;
        const result = await homeSliderCollection.deleteOne({
          _id: new ObjectId(id),
        });
        res.send(result);
      },
    );

    app.patch("/StudentsList/:id", async (req, res) => {
      try {
        const id = req.params.id;
        const { subjects } = req.body; // Array of {subject, semester, cgpa, grade}

        if (!subjects || !Array.isArray(subjects)) {
          return res.status(400).json({
            success: false,
            message: "Subjects array is required",
          });
        }

        // Update the student document with the new subjects array
        const result = await studentsCollection.updateOne(
          { _id: new ObjectId(id) },
          { $set: { subjects: subjects } },
        );
        console.log("newwwwwww", result);
        if (result.matchedCount === 0) {
          return res
            .status(404)
            .json({ success: false, message: "Student not found" });
        }

        res.status(200).json({
          success: true,
          message: "Subjects updated successfully!",
        });
      } catch (error) {
        console.error("Error updating subjects:", error);
        res.status(500).json({
          success: false,
          error: "Failed to update subjects",
        });
      }
    });

    // ==========================admit-card==========================================
    app.post("/api/generate-admit-card", async (req, res) => {
      const {
        studentId,
        institute,
        studentName,
        fatherName,
        motherName,
        dob,
        session,
        gender,
        regNo,
        subject,
        studentRegistrationNumber,
        studentRollNumber,
        searchCourse,
        picture,
      } = req.body;

      try {
        console.log("1. Starting generation process...");

        const templatePath = path.join(__dirname, "./admit.png");
        console.log(`2. Template path: ${templatePath}`);

        // Fetch and process student photo
        const studentPhoto = await fetch(picture);
        if (!studentPhoto.ok) {
          console.error(
            `Error fetching student photo: Status ${studentPhoto.status}`,
          );
          throw new Error(`Failed to fetch student photo: ${picture}`);
        }
        console.log("3. Student photo fetched successfully.");

        const studentPhotoBuffer = await studentPhoto.buffer();
        const processedStudentPhoto = await sharp(studentPhotoBuffer)
          .resize(250, 340) // Resized for a smaller page
          .flatten()
          .toFormat("png")
          .toBuffer();
        console.log("4. Student photo processed with sharp.");

        // Create a new PDF document with smaller dimensions for mobile viewing
        const newPageWidth = 1200;
        const newPageHeight = 860;
        const pdfDoc = await PDFDocument.create();
        const page = pdfDoc.addPage([newPageWidth, newPageHeight]);

        // Embed the admit card template
        const admitCardTemplateImage = await pdfDoc.embedPng(
          fs.readFileSync(templatePath),
        );
        page.drawImage(admitCardTemplateImage, {
          x: 0,
          y: 0,
          width: newPageWidth,
          height: newPageHeight,
        });
        console.log("5. Template image embedded in PDF.");

        // Embed the student photo
        const studentPhotoEmbedded = await pdfDoc.embedPng(
          processedStudentPhoto,
        );
        page.drawImage(studentPhotoEmbedded, {
          x: 950,
          y: 450,
          width: 140, // Matching the resize done with sharp
          height: 160, // Matching the resize done with sharp
        });
        console.log("6. Student photo embedded in PDF.");

        // Embed and draw text fields
        const timesRomanFont = await pdfDoc.embedFont(StandardFonts.TimesRoman);
        const black = rgb(0, 0, 0);
        const red = rgb(0.929, 0.11, 0.141);

        // Left Column - **PLACEHOLDERS: You must adjust all these coordinates**
        page.drawText(studentId, {
          x: 180,
          y: 500,
          font: timesRomanFont,
          size: 22,
          color: red,
        });
        page.drawText(institute, {
          x: 320,
          y: 462,
          font: timesRomanFont,
          size: 22,
          color: black,
        });
        page.drawText(studentName, {
          x: 320,
          y: 430,
          font: timesRomanFont,
          size: 22,
          color: black,
        });
        page.drawText(fatherName, {
          x: 320,
          y: 395,
          font: timesRomanFont,
          size: 22,
          color: black,
        });
        page.drawText(motherName, {
          x: 320,
          y: 364,
          font: timesRomanFont,
          size: 22,
          color: black,
        });
        page.drawText(dob, {
          x: 320,
          y: 332,
          font: timesRomanFont,
          size: 22,
          color: black,
        });
        page.drawText(session, {
          x: 319,
          y: 298,
          font: timesRomanFont,
          size: 22,
          color: black,
        });
        page.drawText(searchCourse, {
          x: 86,
          y: 212,
          font: timesRomanFont,
          size: 22,
          color: black,
        });

        // Right Column - **PLACEHOLDERS: You must adjust all these coordinates**
        page.drawText(studentRollNumber, {
          x: 990,
          y: 410,
          font: timesRomanFont,
          size: 22,
          color: black,
        });
        page.drawText(studentRegistrationNumber, {
          x: 980,
          y: 360,
          font: timesRomanFont,
          size: 22,
          color: black,
        });
        page.drawText(gender, {
          x: 1000,
          y: 321,
          font: timesRomanFont,
          size: 22,
          color: black,
        });
        page.drawText("Regular", {
          x: 1000,
          y: 270,
          font: timesRomanFont,
          size: 22,
          color: black,
        });
        console.log("7. All text fields drawn on PDF.");

        // Save the PDF and send the response
        const pdfBytes = await pdfDoc.save();
        console.log("8. PDF generated successfully.");

        res.setHeader("Content-Type", "application/pdf");
        res.setHeader(
          "Content-Disposition",
          `attachment; filename="admit_card_${studentId}.pdf"`,
        );
        res.send(Buffer.from(pdfBytes));
      } catch (error) {
        console.error("Critical error in /api/generate-admit-card:", error);
        res.status(500).send("An internal error occurred.");
      }
    });

    // ==========================registration-card==========================================

    //qr code scan for registration card
    app.get(
      "/student-registration-card-profile/:studentId",
      async (req, res) => {
        try {
          const { studentId } = req.params;

          const student = await studentsCollection.findOne({
            studentId: studentId,
          });

          if (!student) {
            return res.status(404).send("Student not found.");
          }

          const htmlResponse = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Responsive Registration Card</title>
    <link href="https://cdn.jsdelivr.net/npm/tailwindcss@2.2.19/dist/tailwind.min.css" rel="stylesheet">
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Times+New+Roman:wght@400;700&display=swap" rel="stylesheet">

    <style>
        body {
            font-family: 'Times New Roman', serif;
            -webkit-print-color-adjust: exact !important;
            color-adjust: exact !important;
            background-color: #f0f0f0;
            display: flex;
            justify-content: center;
            align-items: flex-start;
            min-height: 100vh;
            padding: 20px;
            font-size:18px;
        }

        .card-container {
            width: 800px;
            padding: 80px 80px 180px 80px;
            position: relative;
            background-color:rgba(255, 255, 255, 1);
            box-shadow: 0 4px 8px rgba(0, 0, 0, 0.2);
            box-sizing: border-box;
            aspect-ratio: 12 / 16;
            max-width: 100%;
        }
        
        .logo {
            width: 120px;
            height: 140px;
            object-fit: contain;
        }

        .info-table {
            width: 100%;
            border-collapse: collapse;
            font-size: 24px;
        }

        .info-table tr {
            height: 40px;
            
        }
        

        .info-table td {
            padding: 5px 5px;
            vertical-align: middle;
        }

        .label {
            width: 35%;
            font-weight: bold;
            text-align: left;
            padding-right: 10px;
        }
        
        .separator {
            width: 5%;
            text-align: center;
        }
        
        .value {
            width: 60%;
            text-align: left;
        }
        
        .serial-no {
            position: absolute;
            top: 25px;
            left: 80px;
            font-size: 22px;
            font-weight: bold;
            color: black;
        }
        
        .serial-value {
            color: red;
        }
        .titleTop{
            font-size:12px;
        }
        .bt{
            font-size:20px;
        }
             td:first-child {
            font-weight: 400;
        }

        /* Zebra striping for details table */
        
        /* Signature styles */
        .signature-section {
            position: absolute;
            bottom: 10px; /* Adjust as needed for vertical positioning */
            right: 50px; /* Adjust as needed for horizontal positioning */
            text-align: center;
        }

        .signature-image {
            width: 150px; /* Adjust size as needed */
            height: auto;
            display: block; /* Ensures image is on its own line */
            margin: 0 auto 5px auto; /* Center image and add some space below */
        }
        
        .signature-text {
            font-size: 15px; /* Adjust font size as needed */
            font-style: italic; /* If the text is italic in the image */
            font-weight: bold;
        }


        /* Fully Responsive Styles */
        @media (max-width: 768px) {
            .card-container {
                padding: 50px 40px 140px 40px;
            }
            
            .info-table {
                font-size: 16px;
            }

            .info-table tr {
                height: 40px;
            }

            .serial-no {
                top: 15px;
                left: 40px;
                font-size: 16px;
            }
            
            body {
                font-size: 14px;
            }
            
            .logo {
                width: 64px;
                height: 70px;
            }
            .bt{
                font-size:9px
            }
            .titleTop{
                font-size:8px;
            }
            .signature-section {
                padding-top:130px;
                bottom: 40px; /* Adjust for smaller screens */
                right: 40px;
            }
            .signature-image {
                width: 100px; /* Adjust size for smaller screens */
            }
            .signature-text {
                font-size: 14px; /* Adjust font size for smaller screens */
            }
            .website{
                font-size:10px;
            }
        }
        
        /* For screens smaller than 480px (mobile phones) */
        @media (max-width: 480px) {
            .card-container {
                padding: 30px 20px 140px 20px;
            }
            
            .info-table {
                font-size: 14px;
            }
            
            .info-table tr {
                height: 30px;
            }

            .label {
                width: 40%;
                padding-right: 5px;
            }

            .separator {
                width: 5%;
            }

            .value {
                width: 55%;
            }

            .serial-no {
                top: 10px;
                left: 20px;
                font-size: 14px;
            }
            .signature-section {
                margin-top:130px;
                bottom: 20px;
                right: 20px;
            }
            .signature-image {
                width: 80px;
            }
            .signature-text {
                font-size: 12px;
            }
        }
        
        /* Print styles */
        @media print {
            body {
                background-color: transparent;
                display: block;
            }
            .card-container {
                box-shadow: none;
                margin: 0;
                width: 100%;
                max-width: 100%;
                height: auto;
                padding: 100px 80px 80px 80px;
                aspect-ratio: auto;
            }
            .bt{
            font-size:4px;
            }
            .signature-section {
                bottom: 80px; /* Ensure consistent position for print */
                right: 80px;
            }
        }
    </style>
</head>

<body>
    <div class="card-container">
        <header class="header flex items-center justify-between pb-4 border-b-2 border-gray-900">
            <img src="https://i.ibb.co.com/wFNjPW0y/Logo-01.png" alt="logo" class="logo">

            <div class="flex-grow text-center mx-4">
                <p class="titleTop text-gray-800">Approved by Govt. of The People's Republic of Bangladesh</p>
                <h1 class="bt font-bold text-gray-900 mt-1">bangladesh national technical education institute
</h1>
                <div class="mt-2 text-sm text-gray-700">
                    <p class="website">website: www.bntei.com</p>
                    <p class="website">Govt. Reg No: 198385</p>
                </div>
            </div>

            <img src="${student.picture}" alt="Student Photo" class="logo">
        </header>

        

        <table class="info-table">
            <tr>
                <td class="label">Serial Number</td>
                <td class="separator">:</td>
                <td class="value">${student.studentId}</td>
            </tr>
            <tr>
                <td class="label">Reg. Number</td>
                <td class="separator">:</td>
                <td class="value">${student.studentRegistrationNumber}</td>
            </tr>
            <tr>
                <td class="label">Roll Number</td>
                <td class="separator">:</td>
                <td class="value">${student.studentRollNumber}</td>
            </tr>
            <tr>
                <td class="label">Name of Student</td>
                <td class="separator">:</td>
                <td class="value">${student.studentName}</td>
            </tr>
            <tr>
                <td class="label">Father's Name</td>
                <td class="separator">:</td>
                <td class="value">${student.fatherName}</td>
            </tr>
            <tr>
                <td class="label">Mother's Name</td>
                <td class="separator">:</td>
                <td class="value">${student.motherName}</td>
            </tr>
            <tr>
                <td class="label">Gender</td>
                <td class="separator">:</td>
                <td class="value">${student.gender}</td>
            </tr>
            <tr>
                <td class="label">Institute Name</td>
                <td class="separator">:</td>
                <td class="value">${student.institute}</td>
            </tr>
            <tr>
                <td class="label">Student Thana</td>
                <td class="separator">:</td>
                <td class="value">${student.thana}</td>
            </tr>
            <tr>
                <td class="label">District</td>
                <td class="separator">:</td>
                <td class="value">${student.district}</td>
            </tr>
            <tr>
                <td class="label">Course Name</td>
                <td class="separator">:</td>
                <td class="value">${student.searchCourse}</td>
            </tr>
            <tr>
                <td class="label">Duration</td>
                <td class="separator">:</td>
                <td class="value">${student.duration}</td>
            </tr>
            <tr>
                <td class="label">Session</td>
                <td class="separator">:</td>
                <td class="value">${student.session}</td>
            </tr>
        </table>

        <div class="signature-section">
            <img src="https://i.ibb.co.com/LwHVtnr/979-01-removebg-preview.png" alt="Signature" class="signature-image"> 
            <p class="signature-text">Hasnat Abdullah </p>
            <p class="signature-text">Controller of Examination</p>
            <p class="signature-text">Bangladesh Technical  Education Institute</p>
        </div>
    </div>
</body>
</html>`;
          res.send(htmlResponse);
        } catch (error) {
          console.error("Error fetching student profile:", error);
          res.status(500).send("Error loading student profile.");
        }
      },
    );
    //qr code scan for certificate
    app.post("/api/generate-registration-Card", async (req, res) => {
      const {
        studentId,
        studentName,
        fatherName,
        motherName,
        gender,
        institute,
        district,
        thana,
        searchCourse,

        educationQualification,
        session,
        studentRegistrationNumber,
        branchId,
        picture,
        duration,
      } = req.body;

      try {
        // 1. Fetch the branch head's signature
        console.log("1. Starting generation process...");
        const templatePath = path.join(__dirname, "./registrationCard.png");
        console.log(`2. Template path: ${templatePath}`);
        //2.branch head signature
        const branchHead = await branchesCollection.findOne({
          branchId: branchId,
        });
        if (!branchHead || !branchHead.signaturePhoto) {
          throw new Error("Branch head signature not found.");
        }
        const branchHeadSignatureLink = branchHead.signaturePhoto;
        const branchHeadSignatureResponse = await fetch(
          branchHeadSignatureLink,
        );
        if (!branchHeadSignatureResponse.ok) {
          throw new Error(
            `Failed to fetch branch head signature: ${branchHeadSignatureLink}`,
          );
        }
        console.log("3. branch head signature photo fetched successfully.");
        const signatureBuffer = await branchHeadSignatureResponse.buffer();

        // 3. Fetch the student's photo
        const studentPhotoResponse = await fetch(picture);
        if (!studentPhotoResponse.ok) {
          throw new Error(`Failed to fetch student photo: ${picture}`);
        }
        const studentPhotoBuffer = await studentPhotoResponse.buffer();

        // 3. Process the images with sharp to ensure correct dimensions
        // Process the student's photo
        const processedStudentPhoto = await sharp(studentPhotoBuffer)
          .resize(250, 340)
          .flatten()
          .toFormat("png")
          .toBuffer();
        console.log("4. Student photo processed with sharp.");

        // 💥 FIX APPLIED HERE: Use 'fit: contain' to maintain aspect ratio
        // and prevent signatures from being cut off.
        const processedSignature = await sharp(signatureBuffer)
          .resize({
            width: 600,
            height: 200, // Adjust this max height to your design needs
            fit: "contain",
            // Optional: Add a transparent background to ensure centering
            background: { r: 0, g: 0, b: 0, alpha: 0 },
          })
          .toFormat("png")
          .toBuffer();
        console.log(
          "5. Signature photo processed with sharp, fixed aspect ratio issue.",
        );

        // ----------------------------------------------------
        // START OF NEW QR CODE GENERATION CODE
        // ----------------------------------------------------
        const studentProfileUrl = `https://lamim-hamza-project-medicel-server.vercel.app/student-registration-card-profile/${studentId}`;
        console.log(`6. Generating QR code for URL: ${studentProfileUrl}`);

        const qrCodeBuffer = await qrcode.toBuffer(studentProfileUrl, {
          type: "png",
          errorCorrectionLevel: "H",
          scale: 10,
          color: {
            dark: "#000000",
            light: "#0000", // transparent
          },
        });

        const processedQrCode = await sharp(qrCodeBuffer)
          .resize(150, 150)
          .toFormat("png")
          .toBuffer();
        console.log("7. QR code processed with sharp.");
        // ----------------------------------------------------
        // END OF NEW QR CODE GENERATION CODE
        // ----------------------------------------------------

        // 4.Create a new PDF document
        const pdfDoc = await PDFDocument.create();
        const page = pdfDoc.addPage([1200, 1600]);

        // Embed the template image
        const registrationCardTemplate = await pdfDoc.embedPng(
          fs.readFileSync(templatePath),
        );
        page.drawImage(registrationCardTemplate, {
          x: 0,
          y: 0,
          width: 1200,
          height: 1600,
        });

        // Embed and draw the student photo
        const studentPhotoEmbedded = await pdfDoc.embedPng(
          processedStudentPhoto,
        );
        page.drawImage(studentPhotoEmbedded, {
          x: 920,
          y: 1050,
          width: 140,
          height: 160,
        });

        // Embed and draw the signature
        const signatureEmbedded = await pdfDoc.embedPng(processedSignature);
        page.drawImage(signatureEmbedded, {
          x: 550,
          y: 255,
          width: 250, // Keep drawing dimensions fixed
          height: 90, // Keep drawing dimensions fixed
        });

        // ----------------------------------------------------
        // START OF NEW QR CODE DRAWING CODE
        // ----------------------------------------------------
        const qrCodeEmbedded = await pdfDoc.embedPng(processedQrCode);
        page.drawImage(qrCodeEmbedded, {
          x: 910, // Adjust this X coordinate
          y: 890, // Adjust this Y coordinate
          width: 160,
          height: 155,
        });
        console.log("8. QR code embedded in PDF.");
        // ----------------------------------------------------
        // END OF NEW QR CODE DRAWING CODE
        // ----------------------------------------------------

        // Embed and draw text fields
        const timesRomanFont = await pdfDoc.embedFont(StandardFonts.TimesRoman);
        const timesRomanFontbold = await pdfDoc.embedFont(
          StandardFonts.TimesRomanBold,
        );
        const black = rgb(0, 0, 0);
        const red = rgb(0.929, 0.11, 0.141);
        page.drawText(searchCourse, {
          x: 430,
          y: 1300,
          font: timesRomanFontbold,
          size: 30,
          color: black,
        });

        page.drawText(studentId, {
          x: 222,
          y: 1139,
          font: timesRomanFont,
          size: 25,
          color: red,
        });
        page.drawText(studentRegistrationNumber, {
          x: 370,
          y: 1085,
          font: timesRomanFont,
          size: 30,
          color: black,
        });
        page.drawText(studentName, {
          x: 370,
          y: 1015,
          font: timesRomanFont,
          size: 30,
          color: black,
        });
        page.drawText(fatherName, {
          x: 370,
          y: 944,
          font: timesRomanFont,
          size: 30,
          color: black,
        });
        page.drawText(motherName, {
          x: 370,
          y: 870,
          font: timesRomanFont,
          size: 30,
          color: black,
        });
        page.drawText(gender, {
          x: 370,
          y: 803,
          font: timesRomanFont,
          size: 30,
          color: black,
        });
        page.drawText(institute, {
          x: 370,
          y: 730,
          font: timesRomanFont,
          size: 30,
          color: black,
        });
        page.drawText(thana, {
          x: 370,
          y: 660,
          font: timesRomanFont,
          size: 30,
          color: black,
        });
        page.drawText(district, {
          x: 370,
          y: 588,
          font: timesRomanFont,
          size: 30,
          color: black,
        });
        page.drawText(searchCourse, {
          x: 370,
          y: 515,
          font: timesRomanFont,
          size: 30,
          color: black,
        });
        page.drawText(duration, {
          x: 370,
          y: 445,
          font: timesRomanFont,
          size: 30,
          color: black,
        });
        page.drawText(session, {
          x: 370,
          y: 374,
          font: timesRomanFont,
          size: 30,
          color: black,
        });

        // Save the PDF and send the response
        const pdfBytes = await pdfDoc.save();
        res.setHeader("Content-Type", "application/pdf");
        res.setHeader(
          "Content-Disposition",
          `attachment; filename="registration_card_${studentId}.pdf"`,
        );
        res.send(Buffer.from(pdfBytes));
      } catch (error) {
        console.error("Error generating registration card:", error);
        res.status(500).send("Error generating registration card");
      }
    });

    
    //* ============================================= //
    //* ------------------student-profile-------------------//
    //* ============================================= //
    app.get("/student-profile/:studentId", async (req, res) => {
      try {
        const { studentId } = req.params;

        // Fetch student data from your database (e.g., MongoDB)
        const student = await studentsCollection.findOne({
          studentId: studentId,
        });

        if (!student) {
          return res.status(404).send("Student not found.");
        }

        // A simple HTML response to display the student data.
        const htmlResponse = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Student Result</title>
    <link href="https://cdn.jsdelivr.net/npm/tailwindcss@2.2.19/dist/tailwind.min.css" rel="stylesheet">
    <style>
        body {
            font-family: Arial, sans-serif;
            -webkit-print-color-adjust: exact !important;
            color-adjust: exact !important;
            /* Base font size for desktop */
            font-size: 18px;
        }

        .container {
            max-width: 800px;
            margin: 20px auto;
            padding: 20px;
            border: 1px solid #ccc;
            box-shadow: 0 0 10px rgba(0,0,0,0.1);
        }

        .header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding-bottom: 20px;
            border-bottom: 2px solid #000;
        }

        .logo {
            width: 120px;
            height: 140px;
            object-fit: cover;
        }

        .details-table, .marks-table {
            width: 100%;
            border-collapse: collapse;
            margin-top: 20px;
        }

        .details-table td:first-child {
            font-weight: bold;
        }

        /* Zebra striping for details table */
        .details-table tr:nth-child(even) {
            background-color: #b6b6b6;
        }

        .details-table tr:nth-child(odd) {
            background-color: #e9e9e9;
        }
        .marks-table tr td {
            background-color: #e9e9e9;
        }
        .marks-table tr th {
            background-color: #dbdbdbff;
        }

        /* General table cell styling */
        th, td {
            border: 1px solid #000;
            padding: 8px; /* Adjusted padding for better spacing */
            text-align: left; /* Changed from center for better readability */
            vertical-align: middle;
        }

        /* Specific styling for the first column of the details table */
        .details-table td:first-child {
            padding-left: 5px;
        }
          
        
       @media (max-width: 768px) {
    body {
        font-size: 14px;
    }
    .container {
        padding: 10px;
    }
    .header {
        font-size:10px;
        flex-direction: row; /* Changed from row to stack elements vertically */
        text-align: center;
    }
    .logo {
        width: 64px;
        height: 70px;
        margin-top: 10px;
    }
    h1 {
        font-size: 1.2rem !important; /* Made this responsive and important to override inline styles */
    }
    p.header-text-mobile { /* A new class for header paragraphs */
        font-size: 0.8rem;
    }
   
    th, td {
        padding: 4px;
    }
    .marks-table tr td {
        text-align:center;
    }
    .marks-table tr th {
        text-align:center;
    }
}


        

    </style>
</head>
<body>
    <div class="container">
<header class="header flex items-center justify-between pb-3 border-b-2 border-gray-900">

    <!-- Left Logo (Smaller) -->
    <img 
        src="https://i.ibb.co.com/wFNjPW0y/Logo-01.png" 
        alt="logo" 
        class="w-14 h-14 object-contain">

    <div class="flex-grow text-center mx-4">
        <p class="text-xs text-gray-800">
            Approved by Govt. of The People's Republic of Bangladesh
        </p>

        <h1 class="font-bold text-lg text-gray-900 mt-1 capitalize">
            Bangladesh National Technical Education Institute
        </h1>

        <div class="mt-1 text-xs text-gray-700">
            <p>website: www.bntei.com</p>
            <p>Govt. Reg No: C-198385</p>
        </div>
    </div>

    <!-- Student Image (Smaller) -->
    <img 
        src="${student.picture}" 
        alt="Student Photo" 
        class="w-16 h-20 object-cover rounded border border-gray-400">
</header>
        

        <h2 class="text-xl font-bold text-center my-4">RESULT SHEET</h2>
        
        <table class="details-table">
            <tr>
                <td style="text-align: left; padding-left:5px;">Name of Student</td>
                <td style="text-align: left; padding-left:5px;">${
                  student.studentName
                }</td>
            </tr>
            <tr>
                <td style="text-align: left; padding-left:5px;">Father's Name</td>
                <td style="text-align: left; padding-left:5px;">${
                  student.fatherName
                }</td>
            </tr>
            <tr>
                <td style="text-align: left; padding-left:5px;">Mother's Name</td>
                <td style="text-align: left; padding-left:5px;">${
                  student.motherName
                }</td>
            </tr>
            <tr>
                <td style="text-align: left; padding-left:5px;">Date of Birth</td>
                <td style="text-align: left; padding-left:5px;">${
                  student.dob
                }</td>
            </tr>
            <tr>
                <td style="text-align: left;">Institute Name</td>
                <td style="text-align: left; padding-left:5px;">${
                  student.institute
                }</td>
            </tr>
            <tr>
                <td style="text-align: left; padding-left:5px;">Institute Code</td>
                <td style="text-align: left; padding-left:5px;">${
                  student.branchId
                }</td>
            </tr>
            <tr>
                <td style="text-align: left; padding-left:5px;">Roll</td>
                <td style="text-align: left; padding-left:5px;">${
                  student.studentRollNumber
                }</td>
                
            </tr>
            <tr>
                <td style="text-align: left; padding-left:5px;">Registration No</td>
                <td style="text-align: left; padding-left:5px;">${
                  student.studentRegistrationNumber
                }</td>
                
            </tr>
            <tr>
                <td style="text-align: left; padding-left:5px;">Passport No</td>
                <td style="text-align: left; padding-left:5px;">${
                  student.passport
                }</td>
            </tr>
            <tr>
                <td style="text-align: left; padding-left:5px;">Student Type</td>
                <td style="text-align: left; padding-left:5px;">Regular</td>
            </tr>
            <tr>
                <td style="text-align: left; padding-left:5px;">Course Duration</td>
                <td style="text-align: left; padding-left:5px;">${
                  student.duration
                }</td>
            </tr>
            <tr>
                <td style="text-align: left; padding-left:5px;">Session</td>
                <td style="text-align: left; padding-left:5px;">${
                  student.session
                }</td>
            </tr>
            <tr>
                <td style="text-align: left; padding-left:5px;">Course Name</td>
                <td style="text-align: left; padding-left:5px;">${
                  student.searchCourse
                }</td>
            </tr>
            <tr>
                <td style="text-align: left; padding-left:5px;">CGPA Result</td>
                <td style="text-align: left; padding-left:5px;">${
                  student.cgpa
                }</td>
            </tr>
        </table>

        ${
          student.academicRecords &&
          student.academicRecords.some((rec) => rec.mark !== "")
            ? `
        <h3 class="text-lg font-bold text-center my-4">Semester Wise Results</h3>
        <table class="marks-table">
            <thead>
                <tr>
                    <th>Semester</th>
                    <th>Grade</th>
                    <th>CGPA</th>
                </tr>
            </thead>
            <tbody>
                ${student.academicRecords
                  .filter((rec) => rec.mark !== "")
                  .map(
                    (rec) => `
                    <tr>
                        <td>${rec.semester} Semester</td>
                        <td>${rec.grade}</td>
                        <td>${rec.mark}</td>
                    </tr>`,
                  )
                  .join("")}
            </tbody>
        </table>`
            : ""
        }
        
        <h3 class="text-lg font-bold text-center my-4">Course Wise Grade/Marks</h3>
        <table class="marks-table">
            <thead>
                <tr>
                    <th>Written</th>
                    <th>Practical</th>
                    <th>Viva</th>
                    <th>Total</th>
                    <th>Full Mark</th>
                    <th>CGPA</th>
                    <th>Grade</th>
                </tr>
            </thead>
            <tbody>
                <tr>
                    <td>${student.writtenMarks || "N/A"}</td>
                    <td>${student.practicalMark || "N/A"}</td>
                    <td>${student.vivaMarks || "N/A"}</td>
                    <td>${student.totalMarks || "N/A"}</td>
                    <td>${student.fullMark || "N/A"}</td>
                    <td>${student.cgpa || "N/A"}</td>
                    <td>${student.letterGrade || "N/A"}</td>
                </tr>
            </tbody>
        </table>
    </div>
</body>
</html>`;

        res.send(htmlResponse);
      } catch (error) {
        console.error("Error fetching student profile:", error);
        res.status(500).send("Error loading student profile.");
      }
    });
    
    //* ============================================= //
    //* ------------------certificate-------------------//
    //* ============================================= //
    app.post("/api/generate-certificate", async (req, res) => {
      const {
        studentId,
        institute,
        studentName,
        fatherName,
        motherName,
        dob,
        session,
        gender,
        regNo,
        subject,
        studentRegistrationNumber,
        studentRollNumber,
        searchCourse,
        picture,
        publicationDate,
        examinationMonth,
      } = req.body;

      try {
        console.log("1. Starting generation process...");

        // Fetch all student data from the database in one go.
        const studentAllData = await studentsCollection.findOne({
          studentId: studentId,
        });
        if (!studentAllData) {
          return res.status(404).send("Student data not found.");
        }
        const cgpa = studentAllData.cgpa;

        const templatePath = path.join(__dirname, "./certificate.png");
        console.log(`2. Template path: ${templatePath}`);

        const newPageWidth = 1300;
        const newPageHeight = 886;
        const pdfDoc = await PDFDocument.create();

        // Register fontkit to enable custom font embedding
        pdfDoc.registerFontkit(fontkit);

        // Read and embed your custom font.
        const customFontBytes = fs.readFileSync(
          path.join(__dirname, "./Shelley-AllegroScript Wd.ttf"),
        );
        const customFontBytes2 = fs.readFileSync(
          path.join(__dirname, "./ARIAL.TTF"),
        );
        const timesRomanFont = await pdfDoc.embedFont(
          StandardFonts.TimesRomanBoldItalic,
        );
        const customFont = await pdfDoc.embedFont(customFontBytes);
        const customFont2 = await pdfDoc.embedFont(customFontBytes2);

        const page = pdfDoc.addPage([newPageWidth, newPageHeight]);

        // Embed the certificate template image
        const certificateTemplateImage = await pdfDoc.embedPng(
          fs.readFileSync(templatePath),
        );
        page.drawImage(certificateTemplateImage, {
          x: 0,
          y: 0,
          width: newPageWidth,
          height: newPageHeight,
        });
        console.log("5. Template image embedded in PDF.");

        // Define colors
        const black = rgb(0, 0, 0);
        const red = rgb(0.929, 0.11, 0.141);

        // ----------------------------------------------------
        // START OF NEW QR CODE GENERATION CODE
        // ----------------------------------------------------

        const studentProfileUrl = `https://lamim-hamza-project-medicel-server.vercel.app/student-profile/${studentId}`;
        // console.log(`6. Generating QR code for URL: ${studentProfileUrl}`);

        // Generate QR code as a buffer
        const qrCodeBuffer = await qrcode.toBuffer(studentProfileUrl, {
          type: "png",
          errorCorrectionLevel: "H",
          scale: 10,
          color: {
            dark: "#000000", // Black for the QR code dots
            light: "#0000", // Transparent for the background
          },
        });

        // Process the QR code image with sharp to ensure correct size and format
        const processedQrCode = await sharp(qrCodeBuffer)
          .resize(150, 150)
          .toFormat("png")
          .toBuffer();
        console.log("7. QR code processed with sharp.");

        // Embed and draw the QR code on the certificate
        const qrCodeEmbedded = await pdfDoc.embedPng(processedQrCode);
        page.drawImage(qrCodeEmbedded, {
          x: 120,
          y: 255,
          width: 150,
          height: 150,
        });

        console.log("8. QR code embedded in PDF.");

        // ----------------------------------------------------
        // END OF NEW QR CODE GENERATION CODE
        // ----------------------------------------------------

        // Draw all text fields using the custom font and placeholder coordinates
        // You MUST adjust the x and y coordinates to match your specific template.
        page.drawText(studentId, {
          x: 415,
          y: 544,
          font: customFont2,

          size: 21,
          color: black,
        });
        page.drawText(studentRegistrationNumber, {
          x: 955,
          y: 544,
          font: customFont,

          size: 23,
          color: black,
        });
        page.drawText(session, {
          x: 920,
          y: 508,
          font: customFont,
          size: 23,
          color: black,
        });
        page.drawText(studentName, {
          x: 500,
          y: 465,
          font: customFont,
          size: 25,
          color: black,
        });
        page.drawText(fatherName, {
          x: 500,
          y: 422,
          font: customFont,
          size: 25,
          color: black,
        });
        page.drawText(motherName, {
          x: 500,
          y: 379,
          font: customFont,
          size: 25,
          color: black,
        });
        page.drawText(institute, {
          x: 500,
          y: 337,
          font: customFont,
          size: 25,
          color: black,
        });
        page.drawText(studentRollNumber, {
          x: 458,
          y: 294,
          font: customFont,
          size: 25,
          color: black,
        });
        page.drawText(searchCourse, {
          x: 718,
          y: 294,
          font: customFont,
          size: 25,
          color: black,
        });
        page.drawText(cgpa.toString(), {
          x: 1105,
          y: 251,
          font: customFont,
          size: 25,
          color: black,
        });

        page.drawText(examinationMonth, {
          x: 654,
          y: 251,
          font: customFont,
          size: 25,
          color: black,
        });
        page.drawText(publicationDate, {
          x: 318,
          y: 86,
          font: timesRomanFont,
          size: 18,
          color: black,
        });

        console.log("9. All text fields drawn on PDF.");

        // Save the PDF and send the response as a downloadable file
        const pdfBytes = await pdfDoc.save();
        console.log("10. PDF generated successfully.");

        res.setHeader("Content-Type", "application/pdf");
        res.setHeader(
          "Content-Disposition",
          `attachment; filename="certificate_${studentId}.pdf"`,
        );
        res.send(Buffer.from(pdfBytes));
      } catch (error) {
        console.error("Critical error in /api/generate-certificate:", error);
        res.status(500).send("An internal error occurred.");
      }
    });


     //* ============================================= //
    //* ------------------certificateOne--------------//
    //* ============================================= //
     app.post("/api/generate-certificateOne", async (req, res) => {
      const {
        studentId,
        institute,
        studentName,
        fatherName,
        motherName,
        dob,
        session,
        gender,
        regNo,
        subject,
        studentRegistrationNumber,
        studentRollNumber,
        searchCourse,
        picture,
        publicationDate,
        examinationMonth,
      } = req.body;

      try {
        console.log("1. Starting generation process...");

        // Fetch all student data from the database in one go.
        const studentAllData = await studentsCollection.findOne({
          studentId: studentId,
        });
        if (!studentAllData) {
          return res.status(404).send("Student data not found.");
        }
        const cgpa = studentAllData.cgpa;

        const templatePath = path.join(__dirname, "./certificateOne.png");
        console.log(`2. Template path: ${templatePath}`);

        const newPageWidth = 1300;
        const newPageHeight = 886;
        const pdfDoc = await PDFDocument.create();

        // Register fontkit to enable custom font embedding
        pdfDoc.registerFontkit(fontkit);

        // Read and embed your custom font.
        const customFontBytes = fs.readFileSync(
          path.join(__dirname, "./Shelley-AllegroScript Wd.ttf"),
        );
        const customFontBytes2 = fs.readFileSync(
          path.join(__dirname, "./ARIAL.TTF"),
        );
        const timesRomanFont = await pdfDoc.embedFont(
          StandardFonts.TimesRomanBoldItalic,
        );
        const customFont = await pdfDoc.embedFont(customFontBytes);
        const customFont2 = await pdfDoc.embedFont(customFontBytes2);

        const page = pdfDoc.addPage([newPageWidth, newPageHeight]);

        // Embed the certificate template image
        const certificateTemplateImage = await pdfDoc.embedPng(
          fs.readFileSync(templatePath),
        );
        page.drawImage(certificateTemplateImage, {
          x: 0,
          y: 0,
          width: newPageWidth,
          height: newPageHeight,
        });
        console.log("5. Template image embedded in PDF.");

        // Define colors
        const black = rgb(0, 0, 0);
        const red = rgb(0.929, 0.11, 0.141);

        // ----------------------------------------------------
        // START OF NEW QR CODE GENERATION CODE
        // ----------------------------------------------------

        const studentProfileUrl = `https://lamim-hamza-project-medicel-server.vercel.app/student-profile/${studentId}`;
        // console.log(`6. Generating QR code for URL: ${studentProfileUrl}`);

        // Generate QR code as a buffer
        const qrCodeBuffer = await qrcode.toBuffer(studentProfileUrl, {
          type: "png",
          errorCorrectionLevel: "H",
          scale: 10,
          color: {
            dark: "#000000", // Black for the QR code dots
            light: "#0000", // Transparent for the background
          },
        });

        // Process the QR code image with sharp to ensure correct size and format
        const processedQrCode = await sharp(qrCodeBuffer)
          .resize(150, 150)
          .toFormat("png")
          .toBuffer();
        console.log("7. QR code processed with sharp.");

        // Embed and draw the QR code on the certificate
        const qrCodeEmbedded = await pdfDoc.embedPng(processedQrCode);
        page.drawImage(qrCodeEmbedded, {
          x: 111,
          y: 255,
          width: 150,
          height: 150,
        });

        console.log("8. QR code embedded in PDF.");

        // ----------------------------------------------------
        // END OF NEW QR CODE GENERATION CODE
        // ----------------------------------------------------

        // Draw all text fields using the custom font and placeholder coordinates
        // You MUST adjust the x and y coordinates to match your specific template.
        page.drawText(studentId, {
          x: 415,
          y: 544,
          font: customFont2,

          size: 21,
          color: black,
        });
        page.drawText(studentRegistrationNumber, {
          x: 955,
          y: 544,
          font: customFont,

          size: 23,
          color: black,
        });
        page.drawText(session, {
          x: 920,
          y: 508,
          font: customFont,
          size: 23,
          color: black,
        });
        page.drawText(studentName, {
          x: 500,
          y: 465,
          font: customFont,
          size: 25,
          color: black,
        });
        page.drawText(fatherName, {
          x: 500,
          y: 422,
          font: customFont,
          size: 25,
          color: black,
        });
        page.drawText(motherName, {
          x: 500,
          y: 379,
          font: customFont,
          size: 25,
          color: black,
        });
        page.drawText(institute, {
          x: 500,
          y: 337,
          font: customFont,
          size: 25,
          color: black,
        });
        page.drawText(studentRollNumber, {
          x: 458,
          y: 294,
          font: customFont,
          size: 25,
          color: black,
        });
        page.drawText(searchCourse, {
          x: 718,
          y: 294,
          font: customFont,
          size: 25,
          color: black,
        });
        page.drawText(cgpa.toString(), {
          x: 1105,
          y: 251,
          font: customFont,
          size: 25,
          color: black,
        });

        page.drawText(examinationMonth, {
          x: 654,
          y: 251,
          font: customFont,
          size: 25,
          color: black,
        });
        page.drawText(publicationDate, {
          x: 318,
          y: 86,
          font: timesRomanFont,
          size: 18,
          color: black,
        });

        console.log("9. All text fields drawn on PDF.");

        // Save the PDF and send the response as a downloadable file
        const pdfBytes = await pdfDoc.save();
        console.log("10. PDF generated successfully.");

        res.setHeader("Content-Type", "application/pdf");
        res.setHeader(
          "Content-Disposition",
          `attachment; filename="certificate_${studentId}.pdf"`,
        );
        res.send(Buffer.from(pdfBytes));
      } catch (error) {
        console.error("Critical error in /api/generate-certificate:", error);
        res.status(500).send("An internal error occurred.");
      }
    });

    

    //* ============================================= //
    //* ------------------TRANSCRIPT-------------------//
    //* ============================================= //
    app.post("/api/generate-transcript", async (req, res) => {
      const {
        studentId,
        studentName,
        fatherName,
        motherName,
        institute,
        searchCourse,
        session,
        studentRollNumber,
        studentRegistrationNumber,
        publicationDate,
        duration,
        letterGrade,
        cgpa,
        academicRecords = [],
        subjects = [],
      } = req.body;

      try {
        const templatePath = path.join(process.cwd(), "transcript.png");
        const qrPath = path.join(process.cwd(), "qrcode.png");

        const pdfDoc = await PDFDocument.create();
        const page = pdfDoc.addPage([1200, 1600]);
        const black = rgb(0, 0, 0);

        // ================= ➕ Total Credit Calculation =================
        const totalEarnedCredit = subjects
          .reduce((sum, sub) => {
            const creditVal = parseFloat(sub.credit) || 0;
            return sum + creditVal;
          }, 0)
          .toFixed(2);

        // ================= Background =================
        const templateImage = await pdfDoc.embedPng(
          fs.readFileSync(templatePath),
        );
        page.drawImage(templateImage, {
          x: 0,
          y: 0,
          width: 1200,
          height: 1660,
        });

        // ================= 🎓 Student Info =================
        const studentInfo = [
          { text: studentId, x: 210, y: 1355 },

          { text: studentName, x: 235, y: 1309 },
          { text: fatherName, x: 235, y: 1281 },
          { text: motherName, x: 235, y: 1261 },
          { text: institute, x: 235, y: 1236 },
          { text: searchCourse, x: 235, y: 1211 },
          { text: cgpa, x: 235, y: 1187 },

          { text: studentRollNumber, x: 759, y: 1308 },
          { text: studentRegistrationNumber, x: 759, y: 1283 },
          { text: duration, x: 759, y: 1259 },
          { text: session, x: 759, y: 1237 },
          { text: totalEarnedCredit, x: 759, y: 1215},
          { text: letterGrade, x: 759, y: 1191 },

          { text: publicationDate, x: 262, y: 124 },
        ];

        studentInfo.forEach((i) => {
          page.drawText(String(i.text || "-"), {
            x: i.x,
            y: i.y,
            size: 16,
            color: black,
          });
        });

        // =================  8 Semesters Result Tables =================
        const colWidths = [80, 200, 60, 60, 60];
        const headers = [
          "Sub Code",
          "Subject Name",
          "Credit",
          "Grade",
          "Point",
        ];

        let leftY = 1120;
        let rightY = 1120;
        const leftX = 110;
        const rightX = 637;

        academicRecords.slice(0, 8).forEach((sem, index) => {
          const isLeft = index % 2 === 0;
          const startX = isLeft ? leftX : rightX;
          let yPos = isLeft ? leftY : rightY;

          const semNumber = String(sem.semester).replace(/\D/g, "");

          const semSubjects = subjects.filter((sub) => {
            const subSemNumber = String(sub.semester).replace(/\D/g, "");
            return semNumber === subSemNumber;
          });

          let hX = startX;
          headers.forEach((header, idx) => {
            page.drawRectangle({
              x: hX,
              y: yPos,
              width: colWidths[idx],
              height: 18,
              borderWidth: 1,
              borderColor: black,
              color: rgb(0.9, 0.9, 0.9),
            });
            page.drawText(header, {
              x: hX + 3,
              y: yPos + 4,
              size: 10,
              color: black,
            });
            hX += colWidths[idx];
          });

          yPos -= 18;

          if (semSubjects.length > 0) {
            semSubjects.forEach((sub) => {
              let rX = startX;
              const rowValues = [
                String(sub.subjectCode || "N/A"),
                (sub.name || "Subject Name").substring(0, 30),
                String(sub.credit || "0.00"),
                String(sub.grade || "-"),
                String(sub.cgpa || "0.00"),
              ];

              rowValues.forEach((val, idx) => {
                page.drawRectangle({
                  x: rX,
                  y: yPos,
                  width: colWidths[idx],
                  height: 18,
                  borderWidth: 1,
                  borderColor: black,
                });
                page.drawText(String(val), {
                  x: rX + 3,
                  y: yPos + 5,
                  size: 9,
                  color: black,
                });
                rX += colWidths[idx];
              });
              yPos -= 18;
            });
          }

          page.drawRectangle({
            x: startX,
            y: yPos - 2,
            width: 460,
            height: 20,
            borderWidth: 1,
            borderColor: black,
            color: rgb(0.95, 0.95, 0.95),
          });
          page.drawText(
            `Semester: ${sem.semester} | GPA: ${sem.mark} | Grade: ${sem.grade}`,
            {
              x: startX + 5,
              y: yPos + 2,
              size: 10,
              color: black,
            },
          );

          if (isLeft) leftY = yPos - 40;
          else rightY = yPos - 40;
        });

        // ================= 🚀 Response =================
        const pdfBytes = await pdfDoc.save();
        res.setHeader("Content-Type", "application/pdf");
        res.setHeader(
          "Content-Disposition",
          `attachment; filename="Transcript_${studentId}.pdf"`,
        );
        res.send(Buffer.from(pdfBytes));
      } catch (err) {
        console.error("❌ Error:", err);
        res.status(500).send("Internal Server Error");
      }
    });

    //* ============================================= //
    //*------------------TRANSCRIPT ONE----------------//
    //* ============================================= //
    app.post("/api/generate-transcriptOne", async (req, res) => {
      const {
        studentId,
        studentName,
        fatherName,
        motherName,
        institute,
        searchCourse,
        session,
        studentRollNumber,
        studentRegistrationNumber,
        duration,
        letterGrade,
        cgpa,
        academicRecords = [],
        subjects = [],
      } = req.body;

      try {
        const templatePath = path.join(process.cwd(), "transcript.png");
        const qrPath = path.join(process.cwd(), "qrcode.png");

        const pdfDoc = await PDFDocument.create();
        const page = pdfDoc.addPage([1200, 1600]);
        const black = rgb(0, 0, 0);

        // ================= ➕ Total Credit Calculation =================
        const totalEarnedCredit = subjects
          .reduce((sum, sub) => {
            const creditVal = parseFloat(sub.credit) || 0;
            return sum + creditVal;
          }, 0)
          .toFixed(2);

        // ================= Background =================
        const templateImage = await pdfDoc.embedPng(
          fs.readFileSync(templatePath),
        );
        page.drawImage(templateImage, {
          x: 0,
          y: 0,
          width: 1200,
          height: 1660,
        });

        // =================  Student Info =================
        const studentInfo = [
          { text: studentId, x: 210, y: 1355 },
          { text: studentName, x: 275, y: 1309 },
          { text: fatherName, x: 275, y: 1281 },
          { text: motherName, x: 275, y: 1261 },
          { text: institute, x: 275, y: 1236 },
          { text: searchCourse, x: 275, y: 1211 },
          { text: cgpa, x: 275, y: 1187 },
          { text: studentRollNumber, x: 781, y: 1308 },
          { text: studentRegistrationNumber, x: 781, y: 1283 },
          { text: duration, x: 781, y: 1259 },
          { text: session, x: 781, y: 1237 },
          { text: totalEarnedCredit, x: 781, y: 1215 },
          { text: letterGrade, x: 781, y: 1191 },
        ];

        studentInfo.forEach((i) => {
          page.drawText(String(i.text || "-"), {
            x: i.x,
            y: i.y,
            size: 16,
            color: black,
          });
        });

        // =================  6 Semesters Result Tables =================
        const colWidths = [80, 200, 60, 60, 60];
        const headers = [
          "Sub Code",
          "Subject Name",
          "Credit",
          "Grade",
          "Point",
        ];

        let leftY = 1120;
        let rightY = 1120;
        const leftX = 110;
        const rightX = 637;

        academicRecords.slice(0, 6).forEach((sem, index) => {
          const isLeft = index % 2 === 0;
          const startX = isLeft ? leftX : rightX;
          let yPos = isLeft ? leftY : rightY;

          const semNumber = String(sem.semester).replace(/\D/g, "");

          const semSubjects = subjects.filter((sub) => {
            const subSemNumber = String(sub.semester).replace(/\D/g, "");
            return semNumber === subSemNumber;
          });

          // Draw Headers
          let hX = startX;
          headers.forEach((header, idx) => {
            page.drawRectangle({
              x: hX,
              y: yPos,
              width: colWidths[idx],
              height: 18,
              borderWidth: 1,
              borderColor: black,
              color: rgb(0.9, 0.9, 0.9),
            });
            page.drawText(header, {
              x: hX + 3,
              y: yPos + 4,
              size: 10,
              color: black,
            });
            hX += colWidths[idx];
          });

          yPos -= 18;

          // Draw Subject Rows
          if (semSubjects.length > 0) {
            semSubjects.forEach((sub) => {
              let rX = startX;
              const rowValues = [
                String(sub.subjectCode || "N/A"),
                (sub.name || "Subject Name").substring(0, 30),
                String(sub.credit || "0.00"),
                String(sub.grade || "-"),
                String(sub.cgpa || "0.00"),
              ];

              rowValues.forEach((val, idx) => {
                page.drawRectangle({
                  x: rX,
                  y: yPos,
                  width: colWidths[idx],
                  height: 18,
                  borderWidth: 1,
                  borderColor: black,
                });
                page.drawText(String(val), {
                  x: rX + 3,
                  y: yPos + 5,
                  size: 9,
                  color: black,
                });
                rX += colWidths[idx];
              });
              yPos -= 18;
            });
          }

          // Draw Semester Summary (GPA/Grade)
          page.drawRectangle({
            x: startX,
            y: yPos - 2,
            width: 460,
            height: 20,
            borderWidth: 1,
            borderColor: black,
            color: rgb(0.95, 0.95, 0.95),
          });
          page.drawText(
            `Semester: ${sem.semester} | GPA: ${sem.mark} | Grade: ${sem.grade}`,
            {
              x: startX + 5,
              y: yPos + 2,
              size: 10,
              color: black,
            },
          );

          if (isLeft) leftY = yPos - 40;
          else rightY = yPos - 40;
        });

        // =================  Response =================
        const pdfBytes = await pdfDoc.save();
        res.setHeader("Content-Type", "application/pdf");
        res.setHeader(
          "Content-Disposition",
          `attachment; filename="Transcript_${studentId}.pdf"`,
        );
        res.send(Buffer.from(pdfBytes));
      } catch (err) {
        console.error("❌ Error:", err);
        res.status(500).send("Internal Server Error");
      }
    });

    //* ============================================= //
    //*------------------NID CARD-------------------//
    //* ============================================= //
    app.post("/api/generate-NIDCard", async (req, res) => {
      const {
        studentName,
        searchCourse,
        institute,

        studentRegistrationNumber,
        studentRollNumber,
        guardianPhone,
        duration,
        picture,
        session,
        expireDate,
        issueDate,
        branchId,
      } = req.body;

      try {
        const selectedBranch = await branchesCollection.findOne({ branchId });
        const directorName = selectedBranch?.instituteName || "BNTEI";

        const studentAllData = await studentsCollection.findOne({
          studentRegistrationNumber,
        });

        if (!studentAllData) {
          return res.status(404).send("Student data not found! ❌");
        }

        const templatePath = path.join(__dirname, "NIDCard.jpeg");

        if (!fs.existsSync(templatePath)) {
          throw new Error("Template file NIDCard.jpeg not found in directory!");
        }

        const pdfDoc = await PDFDocument.create();
        pdfDoc.registerFontkit(fontkit);

        // 🖋️ Fonts
        const arialFontBytes = fs.readFileSync(
          path.join(__dirname, "ARIAL.TTF"),
        );
        const arialFont = await pdfDoc.embedFont(arialFontBytes);

        const newPageWidth = 800;
        const newPageHeight = 1000;
        const page = pdfDoc.addPage([newPageWidth, newPageHeight]);

        const templateBytes = fs.readFileSync(templatePath);
        const backgroundImg = await pdfDoc.embedJpg(templateBytes);

        page.drawImage(backgroundImg, {
          x: 0,
          y: 0,
          width: newPageWidth,
          height: newPageHeight,
        });

        const black = rgb(0, 0, 0);
        const textColor = rgb(0.2, 0.2, 0.2);
        const red = rgb(1, 0, 0);

        // =================  Drawing Text (As per your Image Layout) =================

        page.drawText(studentName || "", {
          x: 272,
          y: 774,
          size: 30,
          font: arialFont,
          color: red,
        });
        page.drawText(searchCourse || "", {
          x: 272,
          y: 750,
          size: 18,
          font: arialFont,
          color: black,
        });

        page.drawText(studentRollNumber || "", {
          x: 394,
          y: 709,
          size: 22,
          font: arialFont,
          color: black,
        });

        // Reg No
        page.drawText(studentRegistrationNumber || "", {
          x: 394,
          y: 675,
          size: 22,
          font: arialFont,
          color: black,
        });

        // Session (session field used here)
        page.drawText(session || "", {
          x: 394,
          y: 640,
          size: 22,
          font: arialFont,
          color: black,
        });

        // Duration
        page.drawText(duration || "", {
          x: 394,
          y: 608,
          size: 22,
          font: arialFont,
          color: black,
        });

        // Phone
        page.drawText(guardianPhone || "", {
          x: 394,
          y: 580,
          size: 22,
          font: arialFont,
          color: black,
        });

        // Date of Issue
        page.drawText(issueDate || "", {
          x: 185,
          y: 523,
          size: 20,
          font: arialFont,
          color: rgb(1, 1, 1), // White text on dark bg
        });

        // Valid Until
        page.drawText(expireDate || "", {
          x: 460,
          y: 525,
          size: 20,
          font: arialFont,
          color: rgb(1, 1, 1), // White text on dark bg
        });

        page.drawText(institute || "", {
          x: 160,
          y: 287,
          size: 26,
          font: arialFont,
          color: red,
        });
        // Institute Code (Bottom center)
        page.drawText(branchId || "", {
          x: 460,
          y: 249,
          size: 18,
          font: arialFont,
          color: black,
        });

        // =================  Student Picture (Square box in template) =================
        if (picture) {
          try {
            const response = await fetch(picture);
            const arrayBuffer = await response.arrayBuffer();
            const inputBuffer = Buffer.from(arrayBuffer);

            const studentImgBuffer = await sharp(inputBuffer)
              .resize(220, 260, { fit: "cover" })
              .jpeg()
              .toBuffer();

            const studentImage = await pdfDoc.embedJpg(studentImgBuffer);

            page.drawImage(studentImage, {
              x: 45,
              y: 637,
              width: 170,
              height: 210,
            });
          } catch (imgErr) {
            console.error("Image processing error:", imgErr);
          }
        }

        // 💾 Finalize and Send
        const pdfBytes = await pdfDoc.save();
        res.setHeader("Content-Type", "application/pdf");
        res.setHeader(
          "Content-Disposition",
          `attachment; filename="ID_Card_${studentRollNumber}.pdf"`,
        );
        res.send(Buffer.from(pdfBytes));
      } catch (error) {
        console.error("Critical error: 🚨", error);
        res.status(500).send("Internal Server Error");
      }
    });

    app.get("/", (req, res) => {
      res.send(" Server is running...");
    });
    app.listen(PORT, () => {
      console.log(`Server is running on port ${PORT}`);
    });
  } finally {
  }
}

run().catch(console.dir);
