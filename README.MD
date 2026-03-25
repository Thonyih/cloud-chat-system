# 

![Main Diagram.png](/Users/antoniopalma/Documents/temp/cloud-chat-system/Main%20Diagram.png)



# Chat Application Deployment Guide

This guide explains how to deploy the chat application on Google Cloud Platform using Terraform and Ansible.

## Prerequisites

- Windows with WSL2 installed
- Google Cloud Platform account with billing enabled
- Terraform installed
- Ansible installed
- gcloud CLI installed
- Docker daemon

## Deployment Steps

### 1. Start Just Environment

Navigate to the project root and start the Just management environment:

```bash
just start
just mgmt
```

### 2. Authenticate with Google Cloud

```bash
gcloud auth login
```

Follow the browser prompts to authenticate.

### 3. Download Service Account Key

1. Go to the [Google Cloud Console](https://console.cloud.google.com/)
2. Navigate to **IAM & Admin** → **Service Accounts**
3. Select your project's Compute Engine default service account (or create a new one)
4. Click **Keys** → **Add Key** → **Create New Key**
5. Choose **JSON** format and click **Create**
6. Rename the downloaded file to `key.json`
7. Place `key.json` in the `Application/` directory

**⚠️ Security Warning:** Never commit `key.json` to version control! Keep it private.

### 4. Initialize Terraform

Navigate to the Terraform directory:

```bash
cd Application/infra/terraform
```

Initialize Terraform:

```bash
terraform init
```

### 5. Generate SSH Key

Generate an SSH key pair for accessing the VM:

```bash
ssh-keygen -t rsa -b 2048
```

Press Enter to accept the default location (`~/.ssh/id_rsa`), without passwords.

### 6. Deploy Infrastructure

Review the infrastructure plan:

```bash
terraform plan
```

Deploy the infrastructure:

```bash
terraform apply
```

Type `yes` when prompted to confirm.

**Important:** Note the VM's external IP address from the Terraform output.

### 7. Configure Ansible Inventory

Navigate to the Ansible directory:

```bash
cd ../../ansible
```

Edit the `inventory.ini` file and paste the VM IP address:

Here is a command that allows you to generate the full inventory directly from the shell (replace the IP addresses with the ones returned by Terraform if they differ):

`master = "104.199.38.244"
master_ssh = "https://www.googleapis.com/compute/v1/projects/agisit25-g60/zones/europe-west1-b/instances/master"
worker_IPs = tolist([
  "worker1 = 34.52.131.18",
  "worker2 = 104.199.74.5",
  "worker3 = 34.38.234.172",
])`

```bash
cat <<'EOF' > inventory.ini
master ansible_host=<MASTER_IP> ansible_user=ubuntu ansible_ssh_private_key_file=~/.ssh/id_rsa

worker1 ansible_host=<WORKER1_IP> ansible_user=ubuntu ansible_ssh_private_key_file=~/.ssh/id_rsa
worker2 ansible_host=<WORKER2_IP> ansible_user=ubuntu ansible_ssh_private_key_file=~/.ssh/id_rsa
worker3 ansible_host=<WORKER3_IP> ansible_user=ubuntu ansible_ssh_private_key_file=~/.ssh/id_rsa

[master]
master

[workers]
worker1
worker2
worker3

[all:vars]
ansible_python_interpreter=/usr/bin/python3
ansible_ssh_common_args='-o StrictHostKeyChecking=no'
EOF
```

Verify the contents with:

```bash
cat inventory.ini
```

### 8. Deploy Application with Ansible

Run the deployment playbook:

```bash
ansible-playbook -i inventory.ini deploy-all.yml
```

This will:

- Configure the VM
- Install Kubernetes and dependencies
- Create a Kubernetes cluster
- Deploy all application components (databases, microservices, frontend)

The deployment takes approximately 5-10 minutes.

### 9. Access the Application

Once deployment completes, check the Ansible output for the frontend NodePort (look for a line like `frontend NodePort ... 80:XXXXX/TCP`).

Access the application at:

```
http://<YOUR_VM_IP>:<NODEPORT> #The VM IP is set the one for the Master node
```

Example: `http://34.78.225.99:30588`

## Application Architecture

- **4 PostgreSQL Databases**: auth-db, contacts-db, messages-db, groups-db
- **4 Microservices**: auth-users, contacts, messages, groups
- **1 Frontend**: Nginx serving React application
- **1 Kubernetes Node**: Single VM running all components

## Cleanup

**⚠️ IMPORTANT:** Always clean up resources when you're done to avoid ongoing GCP charges! Google Cloud will continue charging you for the running VM even when you're not using it.

### Option 1: Quick Cleanup (Recommended)

If you just want to destroy everything:

```bash
cd Application/infra/terraform
terraform destroy
```

Type `yes` when prompted to confirm. This will delete the entire VM and all resources on it (Kubernetes cluster, databases, applications, etc.).

### Option 2: Clean Kubernetes First (Optional)

If you want to keep the VM but remove the application, or clean up Kubernetes resources before destroying the infrastructure:

```bash
cd Application/ansible
ansible-playbook -i inventory.ini 4-delete-deployment.yml
```

This will delete all Kubernetes deployments, services, configmaps, and secrets.

Then destroy the infrastructure:

```bash
cd ../infra/terraform
terraform destroy
```

Type `yes` when prompted to confirm.

**💰 Cost Warning:** Failing to run `terraform destroy` will result in continuous charges to your GCP account for the running VM (approximately $0.15-0.20 per hour for an e2-standard-4 instance).

## Troubleshooting

### Check Pod Status

SSH into the VM and run:

```bash
kubectl get pods -o wide
```

All pods should show `1/1 READY` and `Running` status.

### Check Service Ports

To find the frontend NodePort:

```bash
kubectl get svc frontend
```

### View Logs

To check logs for a specific service:

```bash
kubectl logs -f deployment/<service-name>
```

Example: `kubectl logs -f deployment/auth-users`

## Notes

- The NodePort changes on each deployment (random port between 30000-32767)
- Backend services use ClusterIP and are only accessible through the frontend
- Database credentials: username=`chat`, password=`chatpass`
- SSH into the VM: `ssh ubuntu@<YOUR_VM_IP>`

---

# Steps to configure the CI/CD for the K8S

### 1. SSH into the master node machine after creation

```bash
gcloud compute ssh master --zone europe-west1-b --project agisit25-g60
```

### 2. Get the Kube configurations to set VARIABLE in gitlab

```bash
sudo cat /home/ubuntu/.kube/config | base64 -w0
```

This will output a big base64 text, copy that and create a new variable in gitlab named
`KUBECONFIG_B64`

### 3. Changes to the .yml

This requires a restart to the Runner VM, inside the Runner VM run

```bash
sudo systemctl restart gitlab-runner
```
