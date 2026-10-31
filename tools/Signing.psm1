#Requires -Version 5.1
# Owner-only release-signing helper. Passwords are prompted at run time, held as
# SecureString, exposed only as PROCESS-scoped env vars for the duration of a
# script block, then removed. Nothing is written to disk, the registry,
# user/machine env vars or the console.

Set-StrictMode -Version Latest

$script:OwnerOnlyMessage = 'Release signing is owner-only: run this script yourself in a PowerShell window.'
$script:EnvNamePattern = '^[A-Za-z_][A-Za-z0-9_]*$'

function Test-SigningInteractive {
    [CmdletBinding()]
    [OutputType([bool])]
    param()

    if (-not [Environment]::UserInteractive) { return $false }
    if ([Console]::IsInputRedirected) { return $false }
    if (-not [string]::IsNullOrEmpty([Environment]::GetEnvironmentVariable('CLAUDECODE', 'Process'))) { return $false }
    if (-not [string]::IsNullOrEmpty([Environment]::GetEnvironmentVariable('CI', 'Process'))) { return $false }
    return $true
}

function Get-SigningPassword {
    [CmdletBinding()]
    [OutputType([securestring])]
    param(
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$Label
    )

    if (-not (Test-SigningInteractive)) { throw $script:OwnerOnlyMessage }

    $secure = Read-Host -Prompt $Label -AsSecureString
    if ($null -eq $secure) { return New-Object System.Security.SecureString }
    return $secure
}

function Use-SigningSecrets {
    [CmdletBinding()]
    param(
        # ENV_NAME = 'Prompt label'. Use [ordered]@{} when there is more than one entry:
        # an entry left empty reuses the FIRST entry's password (PKCS12: store == key).
        [Parameter(Mandatory = $true)]
        [ValidateNotNull()]
        [System.Collections.IDictionary]$Map,

        [Parameter(Mandatory = $true)]
        [ValidateNotNull()]
        [scriptblock]$ScriptBlock
    )

    if ($Map.Count -eq 0) { throw "Map must contain at least one ENV_NAME = 'Prompt label' entry." }
    if ($Map.Count -gt 1 -and -not ($Map -is [System.Collections.Specialized.IOrderedDictionary])) {
        throw 'Map must be an [ordered] dictionary when it has more than one entry, so prompt order and the empty-reuses-first rule are deterministic.'
    }

    $names = New-Object 'System.Collections.Generic.List[string]'
    foreach ($key in $Map.Keys) {
        if ($key -isnot [string] -or $key -notmatch $script:EnvNamePattern) { throw "Invalid environment variable name: '$key'." }
        $label = $Map[$key]
        if ($label -isnot [string] -or [string]::IsNullOrWhiteSpace($label)) { throw "Prompt label for '$key' must be a non-empty string." }
        $names.Add($key)
    }

    if (-not (Test-SigningInteractive)) { throw $script:OwnerOnlyMessage }

    $secrets = New-Object 'System.Collections.Generic.List[System.Security.SecureString]'
    $bstrs = New-Object 'System.Collections.Generic.List[System.IntPtr]'
    $setNames = New-Object 'System.Collections.Generic.List[string]'
    try {
        # Prompt for everything before exposing anything.
        foreach ($name in $names) {
            $secure = Get-SigningPassword -Label $Map[$name]
            if ($secure.Length -eq 0) {
                $secure.Dispose()
                if ($secrets.Count -eq 0) { throw "Password for '$($Map[$name])' must not be empty." }
                $secure = $secrets[0].Copy()
            }
            $secrets.Add($secure)
        }

        for ($i = 0; $i -lt $names.Count; $i++) {
            $name = $names[$i]
            if ($null -ne [Environment]::GetEnvironmentVariable($name, 'Process')) {
                Write-Warning "$name was already set in this process; it is overridden now and removed afterwards."
            }
            $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secrets[$i])
            $bstrs.Add($bstr)
            $setNames.Add($name)
            [Environment]::SetEnvironmentVariable($name, [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr), 'Process')
        }

        & $ScriptBlock
    }
    finally {
        # [NullString]::Value, not $null: PowerShell passes $null to a string parameter as "",
        # and on .NET 9+ (PowerShell 7.5+) "" sets an empty variable instead of removing it.
        foreach ($name in $setNames) { [Environment]::SetEnvironmentVariable($name, [NullString]::Value, 'Process') }
        foreach ($bstr in $bstrs) { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr) }
        foreach ($secure in $secrets) { $secure.Dispose() }
    }
}

Export-ModuleMember -Function Get-SigningPassword, Use-SigningSecrets
