package model

var ReservedFolderNames = []string{
	"attachments",
}

func IsReservedFolderName(name string) bool {
	for _, reserved := range ReservedFolderNames {
		if name == reserved {
			return true
		}
	}
	return false
}

func ContainsReservedFolder(pathParts []string) bool {
	for _, part := range pathParts {
		if IsReservedFolderName(part) {
			return true
		}
	}
	return false
}
