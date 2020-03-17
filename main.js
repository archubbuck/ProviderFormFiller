const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const fs = require("fs-extra");
const moment = require('moment');
const PDFExtract = require('pdf.js-extract').PDFExtract;
const MailComposer = require("nodemailer/lib/mail-composer");

require('update-electron-app')({
    repo: 'https://github.com/archubbuck/ProviderFormFiller'
})

const pdftk = require('node-pdftk');
pdftk.configure({
    bin: path.join(__dirname, "execs", "PDFtk", "bin", "pdftk.exe")
});

function createWindow() {
    // Create the browser window.
    const win = new BrowserWindow({
        webPreferences: {
            nodeIntegration: true
        }
    })

    // and load the index.html of the app.
    win.loadFile('index.html')

    // Open the DevTools.
    // win.webContents.openDevTools()
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(createWindow)

// Quit when all windows are closed.
app.on('window-all-closed', () => {
    // On macOS it is common for applications and their menu bar
    // to stay active until the user quits explicitly with Cmd + Q
    if (process.platform !== 'darwin') {
        app.quit()
    }
})

app.on('activate', () => {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (BrowserWindow.getAllWindows().length === 0) {
        createWindow()
    }
})

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and require them here.

ipcMain.on('parse-treatment-history', async (event, arg) => {
    var pdfExtract = new PDFExtract();
    pdfExtract.extract(arg.path, {}, function (err, data) {
        if (err) return console.log(err);
        var lines = PDFExtract.utils.pageToLines(data.pages[0], 2);
        var rows = PDFExtract.utils.extractTextRows(lines);

        var startIndex = rows.map(items => items.join("").toUpperCase()).findIndex(x => x === "STATUS") + 1;
        var data = rows.splice(startIndex);
        var out = data.map(line => {
            let text = line.join("");

            let request = new Array();
            ["RECORD", "BILL"].forEach(item => {
                if (text.toUpperCase().includes(item)) {
                    request.push(item);
                }
            });

            let sIndex = text.toUpperCase().lastIndexOf("MEDICAL " + request.join(" AND "));
            if (sIndex < 1) return;

            return {
                provider: text.substring(0, sIndex).replace('Ɵ', "ti"),
                request: request
            };
        }).filter(m => m && m.provider && m.request.length > 0);
        event.reply('parse-treatment-history-reply', JSON.stringify(out));
    });
});

ipcMain.on('submit-data', async (event, arg) => {
    for (let i = 0; i < arg.length; i++) {
        process(arg[i], path.join(
            __dirname, "out", `${i}.eml`
        ));
    }
});

ipcMain.on('select-authorization-template', async (event, arg) => {
    const files = dialog.showOpenDialogSync({ properties: ["openFile"] });
    if (files) {
        event.reply('select-authorization-template-reply', files[0]);
    }
});

ipcMain.on('select-treatment-history', async (event, arg) => {
    const files = dialog.showOpenDialogSync({ properties: ["openFile"] });
    if (files) {
        event.reply('select-treatment-history-reply', files[0]);
    }
});

function transform(file, properties) {
    let filename = file.substring(file.lastIndexOf("\\") + 1);
    return pdftk.input(file).fillForm(properties).output()
        .then(buffer => {
            return {
                filename: filename,
                content: buffer
            };
        }).catch(function (a, b) {
            console.log(a);
            console.log(b);
        });
}

function process(data, mailPath) {

    let notes =
        `
URGENT MEDICAL ${data.request.join(" & ")} REQUEST

PLEASE SEND MEDICAL RECORDS AND CHARGES via email to
${data.user.email} or fax to 704-209-7538 ASAP.

DOS: ${data.treatment.start_date} - ${data.treatment.end_date} ${data.request.join(" & ")}

Thank you!
If there is a charge for obtaining this information, please notify my office and a
check will be sent to you. Following is the Medical Authorizations.
`

    let transformations = [
        transform(path.join(__dirname, "temp", "RecordAndBillRequest.pdf"), {
            "Name": data.treatment.provider,
            "Fax": "",
            "From": `${data.user.name} - Fax (704) 209-7538`,
            "Date": moment().format('L'),
            "Subject": `${data.client.name} (DOB: ${data.client.birthday})`,
            "Notes": notes
        }),
        transform(data.documents.authorization, {
            "Client Name": data.client.name,
            "SS #": data.client.social,
            "Client Address": data.client.address,
            "DOB": data.client.birthday,
            "Provider": data.treatment.provider,
            "Start Date": data.treatment.start_date,
            "End Date": data.treatment.end_date,
            "Check Box3": "Yes",
            "Check Box4": "",
            "Text5": "", // Other
            "Date": moment().format('L')
        })
    ];

    Promise.all(transformations).then(values => {

        let mail = new MailComposer({
            headers: { "X-Unsent": 1 },
            subject: data.treatment.provider,
            attachments: values
        });

        let mailReadStream = mail.compile().createReadStream();

        var mailWriteStream = fs.createWriteStream(mailPath);

        mailReadStream.pipe(mailWriteStream);

        mailWriteStream.on("finish", function () {
            shell.openItem(mailPath);
        });
    });
}