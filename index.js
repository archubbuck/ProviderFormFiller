const { ipcRenderer } = require('electron');

const tableShell = `
<table class="table table-hover table-bordered table-sm table-editable mb-0">
    <thead class="thead-dark">
        <tr>
            <th scope="col" style="display: none;">#</th>
            <th scope="col">Provider</th>
            <th scope="col">Request</th>
            <th scope="col">Start</th>
            <th scope="col">End</th>
        </tr>
    </thead>
    <tbody></tbody>
</table>
`

ipcRenderer.on('parse-treatment-history-reply', (event, arg) => {
    const data = JSON.parse(arg);
    console.log(data);

    let doiStart = $("#doi_start").val();
    let doiEnd = $("#doi_end").val() || doiStart;

    let $table = $(tableShell);
    $table.find("tbody").html(data.map((item, i) => {
        return `
            <tr>
                <th scope="row" style="display: none;">${i}</th>
                <td class="tabledit-view-mode"><span class="tabledit-span">${item.provider}</span><input
                        class="tabledit-input form-control input-sm" type="text" value="${item.provider}" />
                </td>
                <td class="tabledit-view-mode"><span class="tabledit-span">${item.request.join(" AND ")}</span><input
                        class="tabledit-input form-control input-sm" type="text" value="${item.request.join(" AND ")}" />
                </td>
                <td class="tabledit-view-mode"><span class="tabledit-span">${doiStart}</span><input
                        class="tabledit-input form-control input-sm" type="text" value="2019-01-01" />
                </td>
                <td class="tabledit-view-mode"><span class="tabledit-span">${doiEnd}</span><input
                        class="tabledit-input form-control input-sm" type="text" value="2020-03-06" />
                </td>
            </tr>
        `
    }));

    $table.Tabledit({
        hideIdentifier: true,
        columns: {
            identifier: [0, 'id'],
            editable: [[1, 'provider'], [2, 'request'], [3, 'start'], [4, 'end']]
        },
        buttons: {
            edit: {
                class: 'btn btn-sm btn-default',
                html: '<i class="far fa-pen-square"></i>',
                action: 'edit'
            },
            delete: {
                class: 'btn btn-sm btn-default',
                html: '<i class="far fa-trash"></i>',
                action: 'delete'
            },
            save: {
                class: 'btn btn-sm btn-success',
                html: 'Save'
            }
        }
    });

    $("#results").html($table);
    $("#export").show();
});

ipcRenderer.on('select-authorization-template-reply', (event, arg) => {
    let $el = $("#file_authorization_template");
    $el.attr("title", arg).val(arg.substring(arg.lastIndexOf("\\") + 1)).data("val", arg);
});

ipcRenderer.on('select-treatment-history-reply', (event, arg) => {
    let $el = $("#file_treatment_history");
    $el.attr("title", arg).val(arg.substring(arg.lastIndexOf("\\") + 1)).data("val", arg);
});

ipcRenderer.on('print', (event, arg) => {
    console.log(event);
    console.log(arg);
});

$(function () {

    $("#file_authorization_template").on("click", () => {
        ipcRenderer.send('select-authorization-template');
    });

    $("#file_treatment_history").on("click", () => {
        ipcRenderer.send('select-treatment-history');
    });

    $("#submit").on("click", () => {
        ipcRenderer.send('parse-treatment-history', {
            path: $("#file_treatment_history").data("val")
        });
    });

    $("#export").on("click", function (e) {
        const yourName = $("#your_name").val();
        const yourEmail = $("#your_email").val();
        const clientName = $("#client_name").val();
        const clientSocial = $("#client_social").val();
        const clientBirthday = $("#client_birthday").val();
        const clientAddress = $("#client_address").val();
        const fileAuthorization = $("#file_authorization_template").data("val");
        const fileTreatmentHistory = $("#file_treatment_history").data("val");

        const data = $('#results tbody tr:not(.tabledit-deleted-row)')
            .map((i, el) => {
                const inputs = $(el).find("input");
                return {
                    documents: {
                        authorization: fileAuthorization,
                        treatments: fileTreatmentHistory
                    },
                    user: {
                        name: yourName,
                        email: yourEmail
                    },
                    client: {
                        name: clientName,
                        social: clientSocial,
                        address: clientAddress,
                        birthday: clientBirthday
                    },
                    treatment: {
                        provider: inputs.eq(0).val().trim(),
                        start_date: inputs.eq(2).val().trim(),
                        end_date: inputs.eq(3).val().trim()
                    },
                    request: inputs.eq(1).val().trim().split(" AND ")
                };
            });
        ipcRenderer.send('submit-data', data);
    });
});