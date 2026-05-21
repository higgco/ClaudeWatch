pipeline {
  agent any

  parameters {
    choice(
      name: 'ENVIRONMENT',
      choices: ['development', 'staging', 'production'],
      description: 'Target environment'
    )
  }

  environment {
    REGION       = 'us-west-2'
    SERVICE_NAME = 'claudewatch'
  }

  stages {
    stage('Configure') {
      steps {
        script {
          def envConfig = [
            development: [
              profile:    'sac-dev',
              accountId:  '753025320351',
              cluster:    'sac-development'
            ],
            staging: [
              profile:    'sac-staging',
              accountId:  '', // TODO: add staging account ID when environment is provisioned
              cluster:    'sac-staging'
            ],
            production: [
              profile:    'sac-prod',
              accountId:  '', // TODO: add production account ID when environment is provisioned
              cluster:    'sac-production'
            ]
          ]

          def cfg = envConfig[params.ENVIRONMENT]
          env.AWS_PROFILE  = cfg.profile
          env.ACCOUNT_ID   = cfg.accountId
          env.CLUSTER      = cfg.cluster
          env.ECR_REGISTRY = "${cfg.accountId}.dkr.ecr.${env.REGION}.amazonaws.com"
          env.ECR_REPO     = "${env.ECR_REGISTRY}/${env.SERVICE_NAME}-${params.ENVIRONMENT}"
          env.SERVICE      = "${env.SERVICE_NAME}-${params.ENVIRONMENT}"
          env.IMAGE_TAG    = "${params.ENVIRONMENT}-${env.BUILD_NUMBER}"
        }
      }
    }

    stage('Build') {
      steps {
        sh "docker build -t ${SERVICE_NAME}:${IMAGE_TAG} ."
      }
    }

    stage('Push') {
      steps {
        sh """
          aws ecr get-login-password --region ${REGION} --profile ${AWS_PROFILE} \
            | docker login --username AWS --password-stdin ${ECR_REGISTRY}
          docker tag ${SERVICE_NAME}:${IMAGE_TAG} ${ECR_REPO}:${IMAGE_TAG}
          docker tag ${SERVICE_NAME}:${IMAGE_TAG} ${ECR_REPO}:latest
          docker push ${ECR_REPO}:${IMAGE_TAG}
          docker push ${ECR_REPO}:latest
        """
      }
    }

    stage('Deploy') {
      steps {
        sh """
          aws ecs update-service \
            --cluster ${CLUSTER} \
            --service ${SERVICE} \
            --force-new-deployment \
            --profile ${AWS_PROFILE} \
            --region ${REGION}
        """
      }
    }
  }

  post {
    always {
      sh "docker rmi ${SERVICE_NAME}:${IMAGE_TAG} || true"
    }
  }
}
