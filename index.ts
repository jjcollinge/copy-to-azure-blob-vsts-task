import tl = require('vsts-task-lib/task');
import trm = require('vsts-task-lib/toolrunner');
import azure = require('azure-storage');
import utils = require('./utils');
import fs = require('fs');

function failTask(message: string) {
    throw new FailTaskError(message);
}

export class FailTaskError extends Error {
}

async function run() {
  try {
    let azureConnectionString : string = tl.getInput("azureconnectionstring", true);
    let containerName : string = tl.getInput("azureblobcontainername", true);
    let sourcePath : string = tl.getPathInput("sourcepath", true);

    var blob = azure.createBlobService()
      .withFilter(new azure.ExponentialRetryPolicyFilter());
    blob.createContainerIfNotExists(containerName, 
    function (error, result, response) {
      if (!error) {
        let isDirectory = fs.lstatSync(sourcePath).isDirectory();
        if (isDirectory) {
          uploadDirectoryBlobs(blob, sourcePath, containerName, function () {
            tl.debug("Finished copying directory to Azure Blob Storage");
          });
        } else {
          let isFile = fs.lstatSync(sourcePath).isFile();
          if (isFile) {
            uploadFileBlob(blob, sourcePath, containerName, function () {
              tl.debug("Finished copying file to Azure Blob Storage");
            });
          } else {
            failTask(tl.loc("InvalidSourcePath", sourcePath));
          }
        }
      } else {
        failTask(tl.loc("FailedToCreateBlobContainer", error.message));
      }
    });
  }
  catch (err) {
    tl.setResult(tl.TaskResult.Failed, err.message);
  }
}

function uploadFileBlob(blob, sourceFilePath, containerName, callback) {
  tl.debug("Uploading file '" + sourceFilePath + "' to Azure Blob Storage");

  var blobName = sourceFilePath.replace(/^.*[\\\/]/, '');
  blob.createBlockBlobFromLocalFile(containerName, blobName, sourceFilePath, function (error) {
    if (error) {
      failTask(tl.loc("FailedToCreateBlobFromLocalFile", error.message));
    } else {
      tl.debug(' Blob ' + blobName + ' upload finished.');
    }
  });
}

function uploadDirectoryBlobs(blob, sourceDirectoryPath, containerName, callback) {
  tl.debug("Uploading directory '" + sourceDirectoryPath + "' to Azure Blob Storage");

  // Search the directory and generate a list of files to upload.
  utils.walk(sourceDirectoryPath, function (error, files) {
    if (error) {
      tl.loc("FailedToWalkDirectory", error.message)
    } else {
      var finished = 0;

      // generate and schedule an upload for each file
      files.forEach(function (file) {
        blob.createBlockBlobFromLocalFile(containerName, file, file, function (error) {
          finished++;

          if (error) {
            tl.loc("FailedToCreateBlobFromFile", error.message)
          } else {
            tl.debug(' Blob ' + file + ' upload finished.');

            if (finished === files.length) {
              // Wait until all workers complete and the blobs are uploaded to the server.
              tl.debug('All files uploaded');
              callback();
            }
          }
        });
      });
    }
  });
}

run();