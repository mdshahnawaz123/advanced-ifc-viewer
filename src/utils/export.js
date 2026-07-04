import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';

/**
 * Export issues to Excel format
 * @param {Array} issues - Array of issue objects
 * @param {Array} selectedColumns - Array of column keys to include
 */
export async function exportIssuesToExcel(issues, selectedColumns) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'IFC Viewer';
  workbook.created = new Date();

  const sheet = workbook.addWorksheet('Issues');

  // Define columns based on selection
  const columns = [];
  const columnKeyMap = {};

  if (selectedColumns.includes('id')) { columns.push({ header: 'ID', key: 'id', width: 10 }); columnKeyMap.id = true; }
  if (selectedColumns.includes('title')) { columns.push({ header: 'Title', key: 'title', width: 30 }); columnKeyMap.title = true; }
  if (selectedColumns.includes('type')) { columns.push({ header: 'Type', key: 'type', width: 15 }); columnKeyMap.type = true; }
  if (selectedColumns.includes('status')) { columns.push({ header: 'Status', key: 'status', width: 15 }); columnKeyMap.status = true; }
  if (selectedColumns.includes('assignee')) { columns.push({ header: 'Assignee', key: 'assignee', width: 20 }); columnKeyMap.assignee = true; }
  if (selectedColumns.includes('description')) { columns.push({ header: 'Description', key: 'description', width: 40 }); columnKeyMap.description = true; }
  if (selectedColumns.includes('date')) { columns.push({ header: 'Date', key: 'date', width: 20 }); columnKeyMap.date = true; }
  if (selectedColumns.includes('image')) { columns.push({ header: 'Image (Snap)', key: 'image', width: 40 }); columnKeyMap.image = true; }

  sheet.columns = columns;

  // Style header row
  sheet.getRow(1).font = { bold: true };
  sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEEEEEE' } };

  // Add rows
  for (let i = 0; i < issues.length; i++) {
    const issue = issues[i];
    const rowObj = {};

    if (columnKeyMap.id) rowObj.id = issue.id;
    if (columnKeyMap.title) rowObj.title = issue.title || 'Unspecified';
    if (columnKeyMap.type) rowObj.type = issue.type ? issue.type.toUpperCase() : 'OTHER';
    if (columnKeyMap.status) rowObj.status = issue.status ? issue.status.toUpperCase() : 'OPEN';
    if (columnKeyMap.assignee) rowObj.assignee = issue.assignee || 'Unassigned';
    if (columnKeyMap.description) rowObj.description = issue.text || '';
    if (columnKeyMap.date) rowObj.date = issue.timestamp ? issue.timestamp.toLocaleString() : '';

    const row = sheet.addRow(rowObj);
    row.alignment = { vertical: 'middle', wrapText: true };

    // Handle Image
    if (columnKeyMap.image && issue.imageURL) {
      row.height = 100; // make row tall enough for image

      try {
        const imageId = workbook.addImage({
          base64: issue.imageURL,
          extension: 'png',
        });

        // Add image to the cell
        // 0-indexed row and column for addImage
        const colIndex = columns.findIndex(c => c.key === 'image');
        sheet.addImage(imageId, {
          tl: { col: colIndex, row: row.number - 1 },
          ext: { width: 160, height: 120 }
        });
      } catch (err) {
        console.warn('Failed to add image to Excel for issue', issue.id, err);
      }
    }
  }

  // Generate buffer and save
  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  saveAs(blob, `Issues_Export_${new Date().toISOString().slice(0, 10)}.xlsx`);
}
