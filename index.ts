import tl = require('vsts-task-lib/task');
import trm = require('vsts-task-lib/toolrunner');
import azure = require('azure-storage');
import utils = require('./utils');
import fs = require('fs');

async function run() {
  try {
    let azureConnectionString = process.env["AZURE_STORAGE_CONNECTION_STRING"];
    let containerName = process.env["AZURE_STORAGE_CONTAINER_NAME"];
    let sourcePath = process.env["SOURCE_DIR_PATH"];

    console.log("Azure ConnectionString: " + azureConnectionString);
    console.log("Azure Storage Container Name: " + containerName);
    console.log("Source Directory Path: " + sourcePath);

    let blob = azure.createBlobService()
      .withFilter(new azure.ExponentialRetryPolicyFilter());
    blob.createContainerIfNotExists(containerName, {
      publicAccessLevel: 'blob',
    }, function (error, result, response) {
      if (!error) {
        let isDirectory = fs.lstatSync(sourcePath).isDirectory();
        if (isDirectory) {
          uploadDirectoryBlobs(blob, sourcePath, containerName, function () {
            console.log("Finished copying directory to Azure Blob Storage");
          });
        } else {
          let isFile = fs.lstatSync(sourcePath).isFile();
          if (isFile) {
            uploadFileBlob(blob, sourcePath, containerName, function () {
              console.log("Finished copying file to Azure Blob Storage");
            });
          } else {
            throw "Invalid file/directory path provided";
          }
        }
      } else {
        throw (error);
      }
    });
  }
  catch (err) {
    tl.setResult(tl.TaskResult.Failed, err.message);
  }
}

function uploadFileBlob(blob, sourceFilePath, containerName, callback) {
  console.log("Uploading file '" + sourceFilePath + "' to Azure Blob Storage");

  var blobName = sourceFilePath.replace(/^.*[\\\/]/, '');
  blob.createBlockBlobFromLocalFile(containerName, blobName, sourceFilePath, function (error) {
    if (error) {
      console.log(error);
    } else {
      console.log(' Blob ' + blobName + ' upload finished.');
    }
  });
}

function uploadDirectoryBlobs(blob, sourceDirectoryPath, containerName, callback) {
  console.log("Uploading directory '" + sourceDirectoryPath + "' to Azure Blob Storage");

  // Search the directory and generate a list of files to upload.
  utils.walk(sourceDirectoryPath, function (error, files) {
    if (error) {
      console.log(error);
    } else {
      var finished = 0;

      // generate and schedule an upload for each file
      files.forEach(function (file) {
        blob.createBlockBlobFromLocalFile(containerName, file, file, function (error) {
          finished++;

          if (error) {
            console.log(error);
          } else {
            console.log(' Blob ' + file + ' upload finished.');

            if (finished === files.length) {
              // Wait until all workers complete and the blobs are uploaded to the server.
              console.log('All files uploaded');
              callback();
            }
          }
        });
      });
    }
  });
}

run();