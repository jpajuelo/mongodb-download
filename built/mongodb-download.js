"use strict";
var os = require('os');
var http = require('https');
var fs = require('fs');
var path = require('path');
var debug = require('debug')('mongodb-download');
var getos = require('getos');
var url = require('url');
var DOWNLOAD_URI = "https://fastdl.mongodb.org";
var MONGODB_VERSION = "latest";
var MongoDBDownload = (function () {
    function MongoDBDownload(_a) {
        var _b = _a.platform, platform = _b === void 0 ? os.platform() : _b, _c = _a.arch, arch = _c === void 0 ? os.arch() : _c, _d = _a.downloadDir, downloadDir = _d === void 0 ? os.tmpdir() : _d, _e = _a.version, version = _e === void 0 ? MONGODB_VERSION : _e, _f = _a.http, http = _f === void 0 ? {} : _f;
        this.options = {
            "platform": platform,
            "arch": arch,
            "downloadDir": downloadDir,
            "version": version,
            "http": http
        };
        this.mongoDBPlatform = new MongoDBPlatform(this.getPlatform(), this.getArch());
        this.options.downloadDir = path.resolve(this.options.downloadDir, 'mongodb-download');
        this.downloadProgress = {
            current: 0,
            length: 0,
            total: 0,
            lastStdout: ""
        };
    }
    MongoDBDownload.prototype.getPlatform = function () {
        return this.options.platform;
    };
    MongoDBDownload.prototype.getArch = function () {
        return this.options.arch;
    };
    MongoDBDownload.prototype.getVersion = function () {
        return this.options.version;
    };
    MongoDBDownload.prototype.getDownloadDir = function () {
        return this.options.downloadDir;
    };
    MongoDBDownload.prototype.getDownloadLocation = function () {
        var _this = this;
        return new Promise(function (resolve, reject) {
            _this.getArchiveName().then(function (archiveName) {
                var downloadDir = _this.getDownloadDir();
                var fullPath = path.resolve(downloadDir, archiveName);
                resolve(fullPath);
            });
        });
    };
    MongoDBDownload.prototype.getTempDownloadLocation = function () {
        var _this = this;
        return new Promise(function (resolve, reject) {
            _this.getArchiveName().then(function (archiveName) {
                var downloadDir = _this.getDownloadDir();
                var fullPath = path.resolve(downloadDir, archiveName + ".downloading");
                resolve(fullPath);
            });
        });
    };
    MongoDBDownload.prototype.download = function () {
        var _this = this;
        return new Promise(function (resolve, reject) {
            var httpOptionsPromise = _this.getHttpOptions();
            var downloadLocationPromise = _this.getDownloadLocation();
            var tempDownloadLocationPromise = _this.getTempDownloadLocation();
            var createDownloadDirPromise = _this.createDownloadDir();
            Promise.all([
                httpOptionsPromise,
                downloadLocationPromise,
                tempDownloadLocationPromise
            ]).then(function (values) {
                var httpOptions = values[0];
                var downloadLocation = values[1];
                var tempDownloadLocation = values[2];
                if (_this.locationExists(downloadLocation) === true) {
                    resolve(downloadLocation);
                }
                else {
                    _this.httpDownload(httpOptions, downloadLocation, tempDownloadLocation).then(function (location) {
                        resolve(location);
                    }, function (e) {
                        reject(e);
                    });
                }
            });
        });
    };
    MongoDBDownload.prototype.httpDownload = function (httpOptions, downloadLocation, tempDownloadLocation) {
        var _this = this;
        return new Promise(function (resolve, reject) {
            var fileStream = fs.createWriteStream(tempDownloadLocation);
            var request = http.get(httpOptions, function (response) {
                _this.downloadProgress.current = 0;
                _this.downloadProgress.length = parseInt(response.headers['content-length'], 10);
                _this.downloadProgress.total = Math.round(_this.downloadProgress.length / 1048576 * 10) / 10;
                response.pipe(fileStream);
                fileStream.on('finish', function () {
                    fileStream.close(function () {
                        fs.renameSync(tempDownloadLocation, downloadLocation);
                        resolve(downloadLocation);
                    });
                });
                response.on("data", function (chunk) {
                    _this.printDownloadProgress(chunk);
                });
                request.on("error", function (e) {
                    debug("request error:", e);
                    reject(e);
                });
            });
        });
    };
    MongoDBDownload.prototype.getCrReturn = function () {
        if (this.mongoDBPlatform.getPlatform() === "win32") {
            return "\x1b[0G";
        }
        else {
            return "\r";
        }
    };
    MongoDBDownload.prototype.locationExists = function (location) {
        var exists;
        try {
            var stats = fs.lstatSync(location);
            debug("sending file from cache");
            exists = true;
        }
        catch (e) {
            if (e.code !== "ENOENT")
                throw e;
            exists = false;
        }
        return exists;
    };
    MongoDBDownload.prototype.printDownloadProgress = function (chunk) {
        var crReturn = this.getCrReturn();
        this.downloadProgress.current += chunk.length;
        var percent_complete = Math.round(100.0 * this.downloadProgress.current / this.downloadProgress.length * 10) / 10;
        var mb_complete = Math.round(this.downloadProgress.current / 1048576 * 10) / 10;
        var text_to_print = "Completed: " + percent_complete + " % (" + mb_complete + "mb / " + this.downloadProgress.total + "mb" + crReturn;
        if (this.downloadProgress.lastStdout !== text_to_print) {
            this.downloadProgress.lastStdout = text_to_print;
            process.stdout.write(text_to_print);
        }
    };
    MongoDBDownload.prototype.getHttpOptions = function () {
        var _this = this;
        return new Promise(function (resolve, reject) {
            _this.getDownloadURI().then(function (downloadURI) {
                _this.options.http.protocol = downloadURI.protocol;
                _this.options.http.hostname = downloadURI.hostname;
                _this.options.http.path = downloadURI.path;
                debug("getHttpOptions", _this.options.http);
                resolve(_this.options.http);
            });
        });
    };
    MongoDBDownload.prototype.getDownloadURI = function () {
        var _this = this;
        return new Promise(function (resolve, reject) {
            var downloadURL = DOWNLOAD_URI + "/" + _this.mongoDBPlatform.getPlatform();
            debug("Download URL for MongoDB: " + downloadURL);
            _this.getArchiveName().then(function (archiveName) {
                downloadURL += "/" + archiveName;
                downloadURL = url.parse(downloadURL);
                resolve(downloadURL);
            });
        });
    };
    MongoDBDownload.prototype.createDownloadDir = function () {
        var _this = this;
        return new Promise(function (resolve, reject) {
            try {
                fs.mkdirSync(_this.getDownloadDir());
            }
            catch (e) {
                if (e.code !== "EEXIST")
                    throw e;
            }
            finally {
                resolve("ok");
            }
        });
    };
    MongoDBDownload.prototype.getArchiveName = function () {
        var _this = this;
        return new Promise(function (resolve, reject) {
            //var name = "mongodb-" + mongo_platform + "-" + mongo_arch;
            var name = "mongodb-" +
                _this.mongoDBPlatform.getPlatform() + "-" +
                _this.mongoDBPlatform.getArch();
            _this.mongoDBPlatform.getOSVersionString().then(function (osString) {
                name += "-" + osString;
            }, function (error) {
                // nothing to add to name ... yet
            }).then(function () {
                name += "-" + _this.getVersion() + "." + _this.mongoDBPlatform.getArchiveType();
                resolve(name);
            });
        });
    };
    return MongoDBDownload;
}());
exports.MongoDBDownload = MongoDBDownload;
var MongoDBPlatform = (function () {
    function MongoDBPlatform(platform, arch) {
        this.platform = this.translatePlatform(platform);
        this.arch = this.translateArch(arch, this.getPlatform());
    }
    MongoDBPlatform.prototype.getPlatform = function () {
        return this.platform;
    };
    MongoDBPlatform.prototype.getArch = function () {
        return this.arch;
    };
    MongoDBPlatform.prototype.getArchiveType = function () {
        if (this.getPlatform() === "win32") {
            return "zip";
        }
        else {
            return "tgz";
        }
    };
    MongoDBPlatform.prototype.getCommonReleaseString = function () {
        var name = "mongodb-" + this.getPlatform() + "-" + this.getArch();
        return name;
    };
    MongoDBPlatform.prototype.getOSVersionString = function () {
        if (this.getPlatform() === "linux" && this.getArch() !== "i686") {
            return this.getLinuxOSVersionString();
        }
        else {
            return this.getOtherOSVersionString();
        }
    };
    MongoDBPlatform.prototype.getOtherOSVersionString = function () {
        return new Promise(function (resolve, reject) {
            reject("");
        });
    };
    MongoDBPlatform.prototype.getLinuxOSVersionString = function () {
        var _this = this;
        return new Promise(function (resolve, reject) {
            getos(function (e, os) {
                if (/ubuntu/i.test(os.dist)) {
                    resolve(_this.getUbuntuVersionString(os));
                }
                else if (/elementary OS/i.test(os.dist)) {
                    resolve(_this.getElementaryOSVersionString(os));
                }
                else if (/suse/i.test(os.dist)) {
                    resolve(_this.getSuseVersionString(os));
                }
                else if (/rhel/i.test(os.dist) || /centos/i.test(os.dist) || /scientific/i.test(os.dist)) {
                    resolve(_this.getRhelVersionString(os));
                }
                else if (/fedora/i.test(os.dist)) {
                    resolve(_this.getFedoraVersionString(os));
                }
                else if (/debian/i.test(os.dist)) {
                    resolve(_this.getDebianVersionString(os));
                }
                else {
                    reject("");
                }
            });
        });
    };
    MongoDBPlatform.prototype.getDebianVersionString = function (os) {
        var name = "debian";
        if (/^(7|8)/.test(os.release)) {
            name += "71";
        }
        else {
            debug("using legacy release");
        }
        return name;
    };
    MongoDBPlatform.prototype.getFedoraVersionString = function (os) {
        var name = "rhel";
        var fedora_version = parseInt(os.release);
        if (fedora_version > 18) {
            name += "70";
        }
        else if (fedora_version < 19 && fedora_version >= 12) {
            name += "62";
        }
        else if (fedora_version < 12 && fedora_version >= 6) {
            name += "55";
        }
        else {
            debug("using legacy release");
        }
        return name;
    };
    MongoDBPlatform.prototype.getRhelVersionString = function (os) {
        var name = "rhel";
        if (/^7/.test(os.release)) {
            name += "70";
        }
        else if (/^6/.test(os.release)) {
            name += "62";
        }
        else if (/^5/.test(os.release)) {
            name += "55";
        }
        else {
            debug("using legacy release");
        }
        return name;
    };
    MongoDBPlatform.prototype.getElementaryOSVersionString = function (os) {
        var name = "ubuntu1404";
        return name;
    };
    MongoDBPlatform.prototype.getSuseVersionString = function (os) {
        var name = "suse";
        if (/^11/.test(os.release)) {
            name += "11";
        }
        else {
            debug("using legacy release");
        }
        return name;
    };
    MongoDBPlatform.prototype.getUbuntuVersionString = function (os) {
        var name = "ubuntu";
        var ubuntu_version = os.release.split('.');
        var major_version = parseInt(ubuntu_version[0]);
        var minor_version = ubuntu_version[1];
        if (os.release == "14.04" || major_version > 14) {
            name += "1404";
        }
        else if (os.release == "12.04") {
            name += "1204";
        }
        else if (os.release == "14.10") {
            name += "1410-clang";
        }
        else {
            debug("using legacy release");
        }
        return name;
    };
    MongoDBPlatform.prototype.translatePlatform = function (platform) {
        switch (platform) {
            case "darwin":
                return "osx";
            case "win32":
                return "win32";
            case "linux":
                return "linux";
            case "elementary OS":
                return "linux";
            case "sunos":
                return "sunos5";
            default:
                debug("unsupported platform %s by MongoDB", platform);
                throw new Error("unsupported OS " + platform);
        }
    };
    MongoDBPlatform.prototype.translateArch = function (arch, mongoPlatform) {
        if (arch === "ia32") {
            if (mongoPlatform === "linux") {
                return "i686";
            }
            else if (mongoPlatform === "win32") {
                return "i386";
            }
            else {
                debug("unsupported mongo platform and os combination");
                throw new Error("unsupported architecture");
            }
        }
        else if (arch === "x64") {
            return "x86_64";
        }
        else {
            debug("unsupported architecture");
            throw new Error("unsupported architecture, ia32 and x64 are the only valid options");
        }
    };
    return MongoDBPlatform;
}());
exports.MongoDBPlatform = MongoDBPlatform;
//# sourceMappingURL=mongodb-download.js.map