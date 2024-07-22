/* global Office, Excel, console, fetch, document */

Office.onReady((info) => {
  if (info.host === Office.HostType.Excel) {
    document.getElementById("sideload-msg").style.display = "none";
    document.getElementById("app-body").style.display = "flex";

    document.getElementById("login-button").onclick = login;
    document.getElementById("run").onclick = run;
    document.getElementById("upload-button").onclick = upload;
  }
});

let token = null;
let initialData = [];
const headers = ["id", "name", "class", "marks", "uploaded_time"];

async function login() {
  const username = document.getElementById("username").value;
  const password = document.getElementById("password").value;
  const loginMessage = document.getElementById("login-message");

  try {
    const response = await fetch("https://localhost:3001/login", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ username, password }),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! Status: ${response.status}`);
    }

    const data = await response.json();
    token = data.token;
    console.log("Login successful, token:", token);

    loginMessage.textContent = "Login successful!";
    loginMessage.style.color = "green";
    document.getElementById("login-section").style.display = "none";
    document.getElementById("actions-section").style.display = "block";
  } catch (error) {
    console.error("Error during login:", error);
    loginMessage.textContent = "Login failed. Please try again.";
    loginMessage.style.color = "red";
  }
}

async function run() {
  if (!token) {
    console.error("User is not authenticated");
    return;
  }

  try {
    await Excel.run(async (context) => {
      const range = context.workbook.getSelectedRange();
      range.load(["address", "rowIndex", "columnIndex"]);
      await context.sync();

      console.log("Sending token in request:", token);
      const response = await fetch("https://localhost:3001/api/students", {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP error! Status: ${response.status}`);
      }

      const data = await response.json();
      console.log("Fetched data:", data);
      initialData = data;

      const sheet = context.workbook.worksheets.getActiveWorksheet();
      const headerRange = sheet.getRangeByIndexes(range.rowIndex, range.columnIndex, 1, headers.length);
      headerRange.values = [headers];
      headerRange.format.fill.color = "lightgray";

      if (data.length > 0) {
        const values = data.map((item) => headers.map((header) => item[header]));
        const dataRange = sheet.getRangeByIndexes(range.rowIndex + 1, range.columnIndex, values.length, headers.length);
        dataRange.values = values;
      } else {
        console.log("No data received from the server. Adding headers for new entries.");
      }

      await context.sync();
      console.log("Data from the database has been inserted into the worksheet.");
    });
  } catch (error) {
    console.error("An unexpected error occurred:", error);
  }
}

function getChanges(newData, oldData) {
  const changes = {
    insert: [],
    update: [],
    delete: [],
  };

  const oldDataMap = new Map(oldData.map((item) => [item.id, item]));

  newData.forEach((newItem) => {
    if (!newItem.id) {
      changes.insert.push(newItem);
    } else {
      const oldItem = oldDataMap.get(newItem.id);
      if (oldItem) {
        oldDataMap.delete(newItem.id);
        if (JSON.stringify(newItem) !== JSON.stringify(oldItem)) {
          changes.update.push(newItem);
        }
      } else {
        changes.insert.push(newItem);
      }
    }
  });

  oldDataMap.forEach((value) => {
    changes.delete.push(value);
  });

  return changes;
}

async function upload() {
  if (!token) {
    console.error("User is not authenticated");
    return;
  }

  try {
    await Excel.run(async (context) => {
      const sheet = context.workbook.worksheets.getActiveWorksheet();
      const range = sheet.getUsedRange();
      range.load("values");
      await context.sync();

      const headers = range.values[0];
      const newData = range.values.slice(1).map((row) => {
        let obj = {};
        headers.forEach((header, index) => {
          obj[header.toLowerCase()] = row[index] || null; // Ensure all data keys are in lower case and handle nulls
        });
        return obj;
      });

      const changes = getChanges(newData, initialData);
      console.log("Changes to upload:", changes);

      const response = await fetch("https://localhost:3001/api/students/changes", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(changes),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`HTTP error! Status: ${response.status}, ${errorText}`);
      }

      initialData = newData; // Update initialData to reflect the new state after successful upload.
      console.log("Changes successfully uploaded to the server.");
    });
  } catch (error) {
    console.error("An unexpected error occurred:", error);
  }
}
