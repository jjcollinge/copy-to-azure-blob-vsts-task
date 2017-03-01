import tl = require('vsts-task-lib/task');
import trm = require('vsts-task-lib/toolrunner');
import azure = require('azure-storage');
import utils = require('./utils');
import fs = require('fs');

async function run() {
    try {
        let azureConnectionString = process.env["AZURE_STORAGE_CONNECTION_STRING"];
        let containerName = process.env["AZURE_STORAGE_CONTAINER_NAME"];
        let sourceDirectoryPath = process.env["SOURCE_DIR_PATH"];

        console.log("Azure ConnectionString: " + azureConnectionString);
        console.log("Azure Storage Container Name: " + containerName);
        console.log("Source Directory Path: " + sourceDirectoryPath);

        console.log("Copying file to Azure Blob Storage");

        let blob = azure.createBlobService()
                               .withFilter(new azure.ExponentialRetryPolicyFilter());
        blob.createContainerIfNotExists(containerName, {
            publicAccessLevel: 'blob',
        }, function(error, result, response) {
            if (!error) {
                uploadBlobs(blob, sourceDirectoryPath, containerName, function() {
                    console.log("Finished copying files to Azure Blob Storage");
                });
            } else {
                throw(error);
            }
        });
    }
    catch (err) {
        tl.setResult(tl.TaskResult.Failed, err.message);
    }
}

function uploadBlobs(blob, sourceDirectoryPath, containerName, callback) {
  // validate directory is valid.
  if (!fs.existsSync(sourceDirectoryPath)) {
    console.log(sourceDirectoryPath + ' is an invalid directory path.');
  } else {
    // Search the directory and generate a list of files to upload.
    utils.walk(sourceDirectoryPath, function (error, files) {
      if (error) {
        console.log(error);
      } else {
        var finished = 0;

        // generate and schedule an upload for each file
        files.forEach(function (file) {
          var blobName = file.replace(/^.*[\\\/]/, '');

          blob.createBlockBlobFromLocalFile(containerName, blobName, file, function (error) {
            finished++;

            if (error) {
              console.log(error);
            } else {
              console.log(' Blob ' + blobName + ' upload finished.');

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
}

run();